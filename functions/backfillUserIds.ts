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
        
        // Pagination parameters
        const batch = payload.batch || 0;
        const limit = payload.limit || 50;
        const skip = batch * limit;

        console.log(`Processing batch ${batch}, limit ${limit}, skip ${skip}`);

        // 1. Get all users to map Email -> ID (Cache this in a real scenario, but for now we fetch it)
        // Optimization: Fetch users only once? 
        // Since this is a stateless function, we fetch every time. 
        // Ideally we'd filter for just the emails we need, but we don't know them yet.
        // Let's just fetch all users (assuming < 10000).
        const users = await svc.entities.User.list({ limit: 10000 }); 
        const emailToId = new Map(users.map(u => [u.email, u.id]));

        // 2. Get batch of habits
        // We sort by created_date to ensure stable pagination
        const habits = await svc.entities.UserProductHabit.list({ 
            sort: { created_date: 1 },
            skip: skip,
            limit: limit 
        });
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errors = 0;
        const results = [];

        for (const habit of habits) {
            // If already has user_id, skip
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
                // console.warn(`No user found for email ${ownerEmail} (habit ${habit.id})`);
                skippedCount++; // Treated as skip but effectively an issue
                results.push({ id: habit.id, status: 'skipped', reason: 'user_not_found', email: ownerEmail });
            }
        }

        const hasMore = habits.length === limit;

        return Response.json({ 
            success: true, 
            message: `Batch ${batch}: Updated ${updatedCount}, Skipped ${skippedCount}`,
            updatedCount,
            skippedCount,
            errors,
            hasMore,
            results
        });

    } catch (error) {
        console.error("Backfill error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});