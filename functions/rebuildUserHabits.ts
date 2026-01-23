import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// Helper to add delay between API calls to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper with exponential backoff
const withRetry = async (fn, maxRetries = 3, baseDelay = 500) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.status === 429 && attempt < maxRetries - 1) {
                const waitTime = baseDelay * Math.pow(2, attempt);
                console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}...`);
                await delay(waitTime);
            } else {
                throw error;
            }
        }
    }
};

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
             return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        const svc = base44.asServiceRole;
        const payload = await req.json();
        
        const limit = payload.limit || 1; // Process 1 user per batch by default to avoid timeouts
        const batch = payload.batch || 0;
        const skip = batch * limit;

        // 1. Fetch Users (using service role to bypass auth restrictions)
        const users = await svc.entities.User.list('created_date', 1000);
        // Manual pagination since list params might vary
        const batchUsers = users.slice(skip, skip + limit);
        
        const results = [];

        for (const targetUser of batchUsers) {
            // 2. Fetch all receipts for this user, sorted by date
            // We use 'created_by' because receipts are owned by the user
            const receipts = await svc.entities.Receipt.filter(
                { created_by: targetUser.email }, 
                'purchased_at', // sort by date ascending (oldest first)
                1000 // limit per user
            );

            if (receipts.length === 0) {
                results.push({ email: targetUser.email, status: 'no_receipts' });
                continue;
            }

            // 3. Wipe existing habits for this user to ensure clean rebuild
            // We need to find them first.
            const existingHabits = await withRetry(() => 
                svc.entities.UserProductHabit.filter({ created_by: targetUser.email })
            );
            
            // Delete existing habits using deleteMany for efficiency
            if (existingHabits.length > 0) {
                // Use filter-based delete instead of individual deletes
                try {
                    await withRetry(() => 
                        svc.entities.UserProductHabit.deleteMany({ created_by: targetUser.email })
                    );
                } catch (err) {
                    // If deleteMany fails, fall back to individual deletes
                    console.log("deleteMany failed, falling back to individual deletes");
                    for (let i = 0; i < existingHabits.length; i++) {
                        try {
                            await svc.entities.UserProductHabit.delete(existingHabits[i].id);
                        } catch (delErr) {
                            // Ignore "not found" errors
                            if (!delErr.message?.includes('not found')) {
                                console.log(`Delete error for ${existingHabits[i].id}: ${delErr.message}`);
                            }
                        }
                        if ((i + 1) % 3 === 0) await delay(350);
                    }
                }
                await delay(600); // Wait after bulk delete
            }

            // 4. Re-calculate habits
            const habitsMap = new Map(); // productId -> habit data

            for (const receipt of receipts) {
                if (!receipt.items || !Array.isArray(receipt.items)) continue;
                
                const receiptDate = new Date(receipt.purchased_at || receipt.created_date);

                for (const item of receipt.items) {
                     // Determine Product ID (SKU > Name)
                     // In real app, we'd look up CanonicalProduct
                     const productId = item.sku || item.code || item.name;
                     if (!productId) continue;

                     const quantity = Number(item.quantity) || 1;
                     
                     if (!habitsMap.has(productId)) {
                         // New Habit
                         habitsMap.set(productId, {
                             user_id: targetUser.id,
                             product_id: productId,
                             product_name: item.name,
                             purchase_count: 1,
                             last_purchase_date: receiptDate,
                             avg_cadence_days: 0,
                             avg_quantity: quantity,
                             confidence_score: item.confidence_score || 0.5,
                             last_calculated_at: new Date(),
                             first_purchase_date: receiptDate
                         });
                     } else {
                         // Update Habit
                         const habit = habitsMap.get(productId);
                         const lastDate = habit.last_purchase_date;
                         const daysSince = (receiptDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                         
                         // Ignore if negative (out of order?) or too small? 
                         // receipts are sorted by purchased_at ascending, so usually daysSince >= 0
                         
                         const newCount = habit.purchase_count + 1;
                         const oldCadence = habit.avg_cadence_days;
                         
                         let newCadence = oldCadence;
                         // Only update cadence if it's a separate trip (e.g. > 1 hour diff)
                         if (daysSince > 0.1) {
                             if (newCount === 2) {
                                 newCadence = daysSince;
                             } else {
                                 // incremental average
                                 // (old * (N-2) + current) / (N-1) -> this logic in processReceipt was slightly approximate
                                 // Correct weighted average:
                                 // We are averaging the INTERVALS. There are (newCount - 1) intervals.
                                 // Previous average was over (newCount - 2) intervals.
                                 // So: (oldCadence * (newCount - 2) + daysSince) / (newCount - 1)
                                 newCadence = (oldCadence * (newCount - 2) + daysSince) / (newCount - 1);
                             }
                         }

                         const newAvgQty = ((habit.avg_quantity * (newCount - 1)) + quantity) / newCount;

                         habit.purchase_count = newCount;
                         habit.last_purchase_date = receiptDate;
                         habit.avg_cadence_days = newCadence;
                         habit.avg_quantity = newAvgQty;
                         habit.last_calculated_at = new Date();
                         // Keep name from latest? Or first? Latest might be better.
                         habit.product_name = item.name; 
                     }
                }
            }

            // 5. Bulk Create
            const habitsToCreate = Array.from(habitsMap.values()).map(h => {
                // remove temp fields if any
                const { first_purchase_date, ...rest } = h;
                return rest;
            });

            if (habitsToCreate.length > 0) {
                // Bulk create in smaller chunks with delays and retries to avoid rate limiting
                // Rate limit: 50 bulk creates per 60 seconds = ~1.2/sec, so delay ~1200ms per chunk
                for (let i = 0; i < habitsToCreate.length; i += 10) {
                    const chunk = habitsToCreate.slice(i, i + 10);
                    await withRetry(() => svc.entities.UserProductHabit.bulkCreate(chunk));
                    await delay(1300); // ~1.3s per bulk create to stay under rate limit
                }
            }

            results.push({ 
                email: targetUser.email, 
                receiptsProcessed: receipts.length, 
                habitsCreated: habitsToCreate.length 
            });
        }

        const hasMore = (skip + limit) < users.length;

        return Response.json({ 
            success: true, 
            message: `Processed batch ${batch}.`,
            results,
            hasMore
        });

    } catch (error) {
        console.error("Rebuild error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});