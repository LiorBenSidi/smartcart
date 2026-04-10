import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const { userId, k_items = 30 } = payload;

        if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

        // 1. Get Self Profile Scores (70% weight)
        const selfVectors = await base44.entities.UserProfileVector.filter({ user_id: userId });
        const selfVec = selfVectors[0]?.vector_json || {};
        
        // 2. Get Collab Scores (30% weight)
        // Call the collab strategy logic internally or via invoke
        // We'll invoke for modularity
        const collabRes = await base44.functions.invoke('collaborativeFilteringStrategy', { userId, k_items: 100 });
        const collabCandidates = collabRes.data?.candidates || [];
        
        // Normalize scores (Min-Max) to make them comparable
        // Helper to normalize map
        const normalize = (map) => {
            const max = Math.max(...Object.values(map), 1);
            Object.keys(map).forEach(k => map[k] /= max);
            return map;
        };

        const selfScores = {};
        Object.keys(selfVec).forEach(k => {
            if (k.startsWith('prod_')) selfScores[k.replace('prod_', '')] = selfVec[k];
        });
        normalize(selfScores);

        const collabScores = {};
        collabCandidates.forEach(c => {
            collabScores[c.canonical_product_id] = c.score;
        });
        normalize(collabScores);

        // 3. Combine
        const combinedScores = {};
        const allIds = new Set([...Object.keys(selfScores), ...Object.keys(collabScores)]);
        
        allIds.forEach(id => {
            const s = selfScores[id] || 0;
            const c = collabScores[id] || 0;
            combinedScores[id] = (0.7 * s) + (0.3 * c);
        });

        // 4. Rank
        const sortedItems = Object.entries(combinedScores)
            .sort(([,a], [,b]) => b - a)
            .slice(0, k_items)
            .map(([id, score]) => ({ id, score }));

        const candidates = sortedItems.map(({id, score}, idx) => ({
            candidate_type: 'canonical_product',
            canonical_product_id: id,
            score: score,
            reason_code: 'hybrid_weighted',
            rank: idx + 1
        }));

        return Response.json({ 
            candidates, 
            meta: { 
                source: "HYBRID", 
                reason: "Based on your recent purchases (70%) and similar profiles (30%).",
                weights: { self: 0.7, collab: 0.3 }
            } 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});