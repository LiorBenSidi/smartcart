import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
             return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        const svc = base44.asServiceRole;

        // 1. Get all users to map Email -> ID
        const users = await svc.entities.User.list({ limit: 1000 }); 
        const emailToId = new Map(users.map(u => [u.email, u.id]));

        // 2. Get all habits (handling pagination ideally, but starting with large limit)
        const habits = await svc.entities.UserProductHabit.list({ limit: 1000 });
        
        let updatedCount = 0;
        let skippedCount = 0;
        let errors = 0;

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
                } catch (e) {
                    console.error(`Failed to update habit ${habit.id}:`, e);
                    errors++;
                }
            } else {
                console.warn(`No user found for email ${ownerEmail} (habit ${habit.id})`);
            }
        }

        return Response.json({ 
            success: true, 
            message: `Backfill complete. Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errors}`,
            stats: { updatedCount, skippedCount, errors }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});