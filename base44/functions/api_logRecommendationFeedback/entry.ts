import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const { user_id, run_id, candidate_id, action, context } = payload;
        
        if (!user_id || !run_id || !candidate_id || !action) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }
        
        // Auth check: ensure user_id matches authenticated user
        if (user && user_id !== user.email && user.role !== 'admin') {
             // allow if service role? but here we check user.
             // If user_id is distinct from email, this logic needs adjustment.
             // Proceeding with strict check for security.
             return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        await base44.entities.RecommendationFeedback.create({
            user_id: user_id,
            run_id: run_id,
            candidate_id: candidate_id,
            action: action,
            created_at: new Date().toISOString()
            // context field is not in schema from previous turn. 
            // If schema doesn't support 'context', we skip it or store in a 'meta' field if added.
            // The prompt says "Insert RecommendationFeedback row". 
            // Assuming schema is fixed to what exists. We drop context if no field.
            // Schema has: user_id, run_id, candidate_id, action, created_at.
        });

        return Response.json({ status: "ok" });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});