import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userEmail = user.email;
        const wrongIdPrefix = '69330b1ba';

        // Fetch habits for this user and find ones with wrong user_id starting with app ID prefix
        const userHabits = await base44.entities.UserProductHabit.filter({ 
            created_by: userEmail 
        });

        // Filter habits where user_id starts with the wrong prefix
        const badHabits = userHabits.filter(h => h.user_id && h.user_id.startsWith(wrongIdPrefix));

        console.log(`[fixHabitUserIds] Found ${userHabits.length} total habits, ${badHabits.length} with wrong user_id prefix`);

        if (badHabits.length === 0) {
            console.log(`[fixHabitUserIds] No habits to fix for ${userEmail}`);
            return Response.json({ success: true, fixed: 0, message: 'No habits to fix' });
        }

        // Update each habit with correct user_id
        let fixed = 0;
        for (const habit of badHabits) {
            console.log(`[fixHabitUserIds] Fixing habit ${habit.id}: ${habit.user_id} -> ${userEmail}`);
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