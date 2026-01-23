import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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
        const maxHabitsPerBatch = payload.maxHabitsPerBatch || 50; // Max habits to create per frontend call


        // 1. Fetch Users
        const users = await svc.entities.User.list('created_date', 1000); // Assuming < 1000 users for now
        // Manual pagination since list params might vary
        const batchUsers = users.slice(skip, skip + limit);
        
        const results = [];

        for (const targetUser of batchUsers) {
            console.log(`[rebuildUserHabits] Processing user: ${targetUser.email}`);
            
            // 2. Fetch all receipts for this user, sorted by date
            // We use 'created_by' because receipts are owned by the user
            console.log(`[rebuildUserHabits] Fetching receipts for ${targetUser.email}...`);
            const receipts = await svc.entities.Receipt.filter(
                { created_by: targetUser.email }, 
                'purchased_at', // sort by date ascending (oldest first)
                1000 // limit per user
            );
            console.log(`[rebuildUserHabits] Found ${receipts.length} receipts for ${targetUser.email}`);

            if (receipts.length === 0) {
                results.push({ email: targetUser.email, status: 'no_receipts' });
                continue;
            }

            // 3. Wipe existing habits for this user to ensure clean rebuild
            // We need to find them first.
            // Note: If habits table is huge, this might be slow.
            // Using filter by user_id if possible, or created_by
            console.log(`[rebuildUserHabits] Fetching existing habits for ${targetUser.email}...`);
            const existingHabits = await svc.entities.UserProductHabit.filter({ created_by: targetUser.email });
            console.log(`[rebuildUserHabits] Found ${existingHabits.length} existing habits to delete`);
            
            // Only delete on first chunk for this user (habitOffset === 0)
            if ((payload.habitOffset || 0) === 0 && existingHabits.length > 0) {
                // Delete sequentially - rate limit is 100/30s, so this should be fine for most users
                for (const h of existingHabits) {
                    await svc.entities.UserProductHabit.delete(h.id);
                }
                console.log(`[rebuildUserHabits] Deleted ${existingHabits.length} existing habits for ${targetUser.email}`);
            } else if ((payload.habitOffset || 0) > 0) {
                console.log(`[rebuildUserHabits] Skipping delete (continuing habit creation from offset ${payload.habitOffset})`);
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

            console.log(`[rebuildUserHabits] Creating ${habitsToCreate.length} habits for ${targetUser.email}`);
            
            // Create habits in chunks, return hasMore if more chunks needed
            const habitOffset = payload.habitOffset || 0;
            const habitsChunk = habitsToCreate.slice(habitOffset, habitOffset + maxHabitsPerBatch);
            
            if (habitsChunk.length > 0) {
                await svc.entities.UserProductHabit.bulkCreate(habitsChunk);
            }
            
            const habitsRemaining = habitsToCreate.length - habitOffset - habitsChunk.length;
            const userHasMore = habitsRemaining > 0;
            
            console.log(`[rebuildUserHabits] Created ${habitsChunk.length} habits (offset ${habitOffset}, ${habitsRemaining} remaining)`);

            results.push({ 
                email: targetUser.email, 
                receiptsProcessed: receipts.length, 
                habitsCreatedThisBatch: habitsChunk.length,
                totalHabits: habitsToCreate.length,
                habitOffset,
                userHasMore
            });
        }

        // Check if current user still has more habits to create
        const currentUserHasMore = results.length > 0 && results[0].userHasMore;
        const hasMoreUsers = (skip + limit) < users.length;
        const hasMore = currentUserHasMore || hasMoreUsers;
        
        // Return next habitOffset if user has more, otherwise reset for next user
        const nextHabitOffset = currentUserHasMore ? (payload.habitOffset || 0) + maxHabitsPerBatch : 0;
        const nextBatch = currentUserHasMore ? batch : batch + 1;

        return Response.json({ 
            success: true, 
            message: `Processed batch ${batch}.`,
            results,
            hasMore,
            nextBatch,
            nextHabitOffset
        });

    } catch (error) {
        console.error("Rebuild error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});