import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userEmail = user.email;
        const wrongId = '69330b1ba1b4842cb79a70d6';

        // Find habits with wrong user_id that belong to this user (by created_by)
        const badHabits = await base44.entities.UserProductHabit.filter({ 
            user_id: wrongId,
            created_by: userEmail 
        });

        if (badHabits.length === 0) {
            return Response.json({ success: true, fixed: 0, message: 'No habits to fix' });
        }

        // Update each habit with correct user_id
        let fixed = 0;
        for (const habit of badHabits) {
            await base44.entities.UserProductHabit.update(habit.id, { user_id: userEmail });
            fixed++;
        }

        console.log(`[fixHabitUserIds] Fixed ${fixed} habits for ${userEmail}`);

        return Response.json({ success: true, fixed, userEmail });
    } catch (error) {
        console.error('[fixHabitUserIds] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});