import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Input Parsing
        // GET request usually doesn't have body, but helper might pass it as query params or body.
        // If it's a GET, we might need to parse URL.
        // But internal SDK invoke passes payload as body (POST) usually even if we say it's "GET" logic.
        // Deno.serve receives a Request object.
        // base44.functions.invoke uses POST under the hood. So we read JSON.
        
        const payload = await req.json().catch(() => ({}));
        const runId = payload.run_id;

        if (!runId) return Response.json({ error: "run_id required" }, { status: 400 });

        // Load Run
        const runs = await base44.entities.RecommendationRun.filter({ id: runId });
        if (runs.length === 0) return Response.json({ error: "Run not found" }, { status: 404 });
        const run = runs[0];

        // Auth Check
        if (user && run.user_id !== user.email && user.role !== 'admin') {
             // If run.user_id is not email but internal ID, this check might fail. 
             // Assuming user_id is email as per context.
             return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        // Load Candidates
        const candidates = await base44.entities.RecommendationCandidate.filter({ run_id: runId });

        // Group Candidates
        const responseCandidates = {
            stores: candidates.filter(c => c.candidate_type === 'store_chain').map(c => ({ candidate_id: c.id, store_chain_id: c.store_chain_id, score: c.score, reason_code: c.reason_code })),
            categories: candidates.filter(c => c.candidate_type === 'category').map(c => ({ candidate_id: c.id, category: c.category, score: c.score, reason_code: c.reason_code })),
            items: candidates.filter(c => c.candidate_type === 'canonical_product').map(c => ({ candidate_id: c.id, canonical_product_id: c.canonical_product_id, score: c.score, reason_code: c.reason_code }))
        };

        return Response.json({
            run: {
                id: run.id,
                user_id: run.user_id,
                algorithm: run.algorithm,
                model_version: run.model_version,
                created_at: run.created_at
            },
            candidates: responseCandidates
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});