import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { tip, action } = await req.json();

        if (!tip || !action) {
            return Response.json({ error: "Missing tip or action" }, { status: 400 });
        }

        await base44.entities.SmartTipFeedback.create({
            user_id: user.email,
            tip_type: tip.type,
            tip_message_snippet: tip.message.substring(0, 50),
            full_message: tip.message,
            action: action,
            created_at: new Date().toISOString()
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});