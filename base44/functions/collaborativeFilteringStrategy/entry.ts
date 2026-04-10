import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const { userId, k_items = 30 } = payload;

        if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

        // 1. Get Similar Users
        const indexes = await base44.entities.SimilarUserIndex.filter({ user_id: userId });
        const similarUserIds = indexes[0]?.similar_user_ids || [];

        if (similarUserIds.length === 0) {
            // Very Cold Start: Fallback to popularity or category/diet alignment
             return Response.json({ 
                candidates: [], 
                meta: { source: "COLLAB_EMPTY", reason: "Not enough data for similarity" } 
            });
        }

        // 2. Aggregate Items from Similar Users
        // We look at their recent "favorite" items (high frequency in vector)
        const itemScores = {};
        
        // Fetch vectors of neighbors
        // Optimization: We could store "top items" in SimilarUserIndex to avoid N fetches
        // For now, we fetch vectors again.
        await Promise.all(similarUserIds.slice(0, 10).map(async (neighborId) => {
            const vecs = await base44.entities.UserProfileVector.filter({ user_id: neighborId });
            const vec = vecs[0]?.vector_json || {};
            
            // Weight by similarity? Assuming equal weight for top K here for simplicity, 
            // or use scores_json if passed.
            // Let's assume weight 1.0 for simplicity in this MVP step.
            
            Object.keys(vec).forEach(key => {
                if (key.startsWith('prod_')) {
                    const prodId = key.replace('prod_', '');
                    itemScores[prodId] = (itemScores[prodId] || 0) + vec[key];
                }
            });
        }));

        // 3. Rank
        const sortedItems = Object.entries(itemScores)
            .sort(([,a], [,b]) => b - a)
            .slice(0, k_items)
            .map(([id, score]) => ({ id, score }));

        // 4. Format Output
        const candidates = sortedItems.map(({id, score}, idx) => ({
            candidate_type: 'canonical_product',
            canonical_product_id: id,
            score: score, // Raw aggregated score
            reason_code: 'collaborative_filtering',
            rank: idx + 1
        }));

        return Response.json({ 
            candidates, 
            meta: { 
                source: "COLLAB", 
                reason: "Users with similar tastes often buy these items." 
            } 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});