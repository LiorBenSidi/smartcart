import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const { runId, candidateId, action } = payload;
        
        if (!runId || !candidateId || !action) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }

        await base44.entities.RecommendationFeedback.create({
            user_id: user.email, // Or internal ID
            run_id: runId,
            candidate_id: candidateId,
            action: action,
            created_at: new Date().toISOString()
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});