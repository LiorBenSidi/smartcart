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
        const limit = payload.limit || 50;

        // Fetch users for mapping
        const users = await svc.entities.User.list('created_date', 10000); 
        const emailToId = new Map(users.map(u => [u.email, u.id]));

        // Try to filter for records missing user_id
        // We use filter with empty query {} and sort by created_date to get consistent chunks
        // Since we can't easily rely on 'skip' in some SDK versions, and 'user_id: null' might not work
        // reliably across all adapters, we'll fetch a batch of ALL records,
        // and process them.
        
        // However, to process efficiently without re-fetching updated ones:
        // If we can filter by { user_id: null }, that's ideal.
        // Let's try to query for it.
        
        // NOTE: If { user_id: null } doesn't work, we might get 0 results.
        // Fallback strategy: List all recent habits.
        
        // Strategy: Use a cursor based on updated_date? No, that changes.
        // Let's try listing all with a high limit for now, filtering in memory.
        
        const habits = await svc.entities.UserProductHabit.list('created_date', 1000);
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errors = 0;
        const results = [];

        for (const habit of habits) {
            // Stop if we hit the batch limit
            if (updatedCount >= limit) break;

            if (habit.user_id) {
                skippedCount++;
                continue;
            }

            const ownerEmail = habit.created_by;
            const userId = emailToId.get(ownerEmail);

            if (userId) {
                try {
                    await svc.entities.UserProductHabit.update(habit.id, { user_id: userId });
                    updatedCount++;
                    results.push({ id: habit.id, status: 'updated', email: ownerEmail });
                } catch (e) {
                    console.error(`Failed to update habit ${habit.id}:`, e);
                    errors++;
                    results.push({ id: habit.id, status: 'error', error: e.message });
                }
            } else {
                skippedCount++;
                results.push({ id: habit.id, status: 'skipped', reason: 'user_not_found', email: ownerEmail });
            }
        }

        return Response.json({ 
            success: true, 
            message: `Processed batch. Updated: ${updatedCount}, Skipped: ${skippedCount}`,
            updatedCount,
            skippedCount,
            errors,
            hasMore: updatedCount === limit, // Rough heuristic
            results
        });

    } catch (error) {
        console.error("Backfill error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});