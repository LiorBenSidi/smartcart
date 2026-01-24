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
        const mode = payload.mode || 'full'; // 'full' = delete all & rebuild, 'incremental' = update only new receipts
        const specificUserId = payload.userId; // Optional: process only this specific user (email)

        // 1. Fetch Users
        let batchUsers;
        if (specificUserId) {
            // If a specific userId (email) is provided, only process that user
            const allUsers = await svc.entities.User.filter({ email: specificUserId });
            batchUsers = allUsers.length > 0 ? [allUsers[0]] : [];
            console.log(`[rebuildUserHabits] Processing specific user: ${specificUserId}`);
        } else {
            const users = await svc.entities.User.list('created_date', 1000); // Assuming < 1000 users for now
            // Manual pagination since list params might vary
            batchUsers = users.slice(skip, skip + limit);
        }
        
        const results = [];

        const habitOffset = payload.habitOffset || 0;
        
        for (const targetUser of batchUsers) {
            console.log(`[rebuildUserHabits] Processing user: ${targetUser.email}, habitOffset: ${habitOffset}`);
            
            // 2. Fetch all receipts for this user, sorted by date
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

            // INCREMENTAL MODE: Only process new receipts since last habit update
            if (mode === 'incremental') {
                console.log(`[rebuildUserHabits] INCREMENTAL mode for ${targetUser.email}`);
                
                // Fetch existing habits - use user_id field (email) not created_by
                const existingHabits = await svc.entities.UserProductHabit.filter({ user_id: targetUser.email });
                const habitsMap = new Map();
                let latestHabitDate = null;
                
                // Build map from existing habits and find the most recent last_purchase_date
                for (const h of existingHabits) {
                    habitsMap.set(h.product_id, {
                        id: h.id, // Keep ID for updates
                        user_id: h.user_id,
                        product_id: h.product_id,
                        product_name: h.product_name,
                        purchase_count: h.purchase_count || 1,
                        last_purchase_date: new Date(h.last_purchase_date),
                        avg_cadence_days: h.avg_cadence_days || 0,
                        avg_quantity: h.avg_quantity || 1,
                        confidence_score: h.confidence_score || 0.5,
                        last_calculated_at: new Date()
                    });
                    const habitDate = new Date(h.last_purchase_date);
                    if (!latestHabitDate || habitDate > latestHabitDate) {
                        latestHabitDate = habitDate;
                    }
                }
                
                // Filter receipts to only those AFTER the latest habit date
                const newReceipts = latestHabitDate 
                    ? receipts.filter(r => new Date(r.purchased_at || r.created_date) > latestHabitDate)
                    : receipts; // If no habits exist, process all receipts
                
                console.log(`[rebuildUserHabits] Found ${newReceipts.length} new receipts since ${latestHabitDate?.toISOString() || 'never'}`);
                
                if (newReceipts.length === 0) {
                    results.push({ email: targetUser.email, status: 'no_new_receipts', mode: 'incremental' });
                    continue;
                }
                
                const habitsToUpdate = [];
                const habitsToCreate = [];
                
                // Process only new receipts
                for (const receipt of newReceipts) {
                    if (!receipt.items || !Array.isArray(receipt.items)) continue;
                    const receiptDate = new Date(receipt.purchased_at || receipt.created_date);
                    
                    for (const item of receipt.items) {
                        const productId = item.sku || item.code || item.name;
                        if (!productId) continue;
                        const quantity = Number(item.quantity) || 1;
                        
                        if (!habitsMap.has(productId)) {
                            // New habit
                            habitsMap.set(productId, {
                                user_id: targetUser.email,
                                product_id: productId,
                                product_name: item.name,
                                purchase_count: 1,
                                last_purchase_date: receiptDate,
                                avg_cadence_days: 0,
                                avg_quantity: quantity,
                                confidence_score: item.confidence_score || 0.5,
                                last_calculated_at: new Date(),
                                _isNew: true
                            });
                        } else {
                            // Update existing habit
                            const habit = habitsMap.get(productId);
                            const lastDate = habit.last_purchase_date;
                            const daysSince = (receiptDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
                            
                            const newCount = habit.purchase_count + 1;
                            let newCadence = habit.avg_cadence_days;
                            
                            if (daysSince > 0.1) {
                                if (newCount === 2) {
                                    newCadence = daysSince;
                                } else {
                                    newCadence = (habit.avg_cadence_days * (newCount - 2) + daysSince) / (newCount - 1);
                                }
                            }
                            
                            const newAvgQty = ((habit.avg_quantity * (newCount - 1)) + quantity) / newCount;
                            
                            habit.purchase_count = newCount;
                            habit.last_purchase_date = receiptDate;
                            habit.avg_cadence_days = newCadence;
                            habit.avg_quantity = newAvgQty;
                            habit.last_calculated_at = new Date();
                            habit.product_name = item.name;
                            habit._isUpdated = true;
                        }
                    }
                }
                
                // Separate new vs updated habits
                for (const [productId, habit] of habitsMap) {
                    if (habit._isNew) {
                        const { id, _isNew, _isUpdated, ...createData } = habit;
                        habitsToCreate.push(createData);
                    } else if (habit._isUpdated) {
                        const { id, _isNew, _isUpdated, user_id, product_id, ...updateData } = habit;
                        habitsToUpdate.push({ id, data: updateData });
                    }
                }
                
                // Perform updates
                for (const { id, data } of habitsToUpdate) {
                    await svc.entities.UserProductHabit.update(id, data);
                }
                
                // Bulk create new habits
                if (habitsToCreate.length > 0) {
                    await svc.entities.UserProductHabit.bulkCreate(habitsToCreate);
                }
                
                console.log(`[rebuildUserHabits] Incremental: updated ${habitsToUpdate.length}, created ${habitsToCreate.length} habits`);
                
                results.push({ 
                    email: targetUser.email, 
                    mode: 'incremental',
                    newReceiptsProcessed: newReceipts.length,
                    habitsUpdated: habitsToUpdate.length,
                    habitsCreated: habitsToCreate.length
                });
                continue; // Move to next user
            }

            // FULL MODE: Delete all and rebuild (original behavior)
            // 3. Only delete existing habits on FIRST call for this user (habitOffset === 0)
            if (habitOffset === 0) {
                console.log(`[rebuildUserHabits] FULL mode - Fetching existing habits for ${targetUser.email}...`);
                const existingHabits = await svc.entities.UserProductHabit.filter({ user_id: targetUser.email });
                console.log(`[rebuildUserHabits] Found ${existingHabits.length} existing habits to delete`);
                
                if (existingHabits.length > 0) {
                    const DELETE_BATCH_SIZE = 50;
                    const deleteChunk = existingHabits.slice(0, DELETE_BATCH_SIZE);
                    
                    for (const h of deleteChunk) {
                        await svc.entities.UserProductHabit.delete(h.id);
                    }
                    console.log(`[rebuildUserHabits] Deleted ${deleteChunk.length} of ${existingHabits.length} habits`);
                    
                    if (existingHabits.length > DELETE_BATCH_SIZE) {
                        return Response.json({
                            success: true,
                            message: `Deleting old habits for ${targetUser.email}...`,
                            results: [{ email: targetUser.email, status: 'deleting', deleted: deleteChunk.length, remaining: existingHabits.length - deleteChunk.length }],
                            hasMore: true,
                            nextBatch: batch,
                            nextHabitOffset: -1,
                            deleteInProgress: true,
                            mode: 'full'
                        });
                    }
                }
                // No habits or all deleted - proceed to creation
            } else if (habitOffset === -1) {
                // Continue deleting
                console.log(`[rebuildUserHabits] Continuing delete for ${targetUser.email}...`);
                const existingHabits = await svc.entities.UserProductHabit.filter({ created_by: targetUser.email });
                
                if (existingHabits.length > 0) {
                    const DELETE_BATCH_SIZE = 50;
                    const deleteChunk = existingHabits.slice(0, DELETE_BATCH_SIZE);
                    
                    for (const h of deleteChunk) {
                        await svc.entities.UserProductHabit.delete(h.id);
                    }
                    console.log(`[rebuildUserHabits] Deleted ${deleteChunk.length} more habits, ${existingHabits.length - deleteChunk.length} remaining`);
                    
                    if (existingHabits.length > DELETE_BATCH_SIZE) {
                        return Response.json({
                            success: true,
                            message: `Deleting old habits for ${targetUser.email}...`,
                            results: [{ email: targetUser.email, status: 'deleting', deleted: deleteChunk.length, remaining: existingHabits.length - deleteChunk.length }],
                            hasMore: true,
                            nextBatch: batch,
                            nextHabitOffset: -1,
                            deleteInProgress: true,
                            mode: 'full'
                        });
                    }
                }
                // Done deleting, now start creating (reset habitOffset to 0 for next call)
                return Response.json({
                    success: true,
                    message: `Finished deleting habits for ${targetUser.email}, ready to create.`,
                    results: [{ email: targetUser.email, status: 'delete_complete' }],
                    hasMore: true,
                    nextBatch: batch,
                    nextHabitOffset: 0,
                    mode: 'full'
                });
            } else {
                console.log(`[rebuildUserHabits] Skipping delete (continuing habit creation from offset ${habitOffset})`);
            }

            // 4. Re-calculate habits (FULL mode)
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
                             user_id: targetUser.email,
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
            nextHabitOffset,
            mode
        });

    } catch (error) {
        console.error("Rebuild error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});