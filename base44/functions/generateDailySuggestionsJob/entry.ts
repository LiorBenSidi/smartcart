import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // This function must be called by admin or as a system job
        if (user?.role !== 'admin') {
            return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        // Fetch all users
        const allUsers = await base44.asServiceRole.entities.User.list();
        
        if (!allUsers || allUsers.length === 0) {
            return Response.json({ message: "No users to process", processed: 0 });
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Generate suggestions for each user
        for (const user of allUsers) {
            try {
                // Invoke generateDailySuggestions for each user via service role
                const response = await base44.asServiceRole.functions.invoke('generateDailySuggestions', {
                    currentCartItems: []
                });
                
                if (response.data.success || response.data.message) {
                    successCount++;
                } else {
                    errorCount++;
                    errors.push({ user: user.email, error: response.data.error });
                }
            } catch (error) {
                errorCount++;
                errors.push({ user: user.email, error: error.message });
            }
        }

        return Response.json({
            success: true,
            message: `Daily suggestions generation complete`,
            processed: allUsers.length,
            successCount,
            errorCount,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("Daily suggestions job failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});