import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const userId = payload.userId || (user ? user.email : null);
        const contextStoreChainId = payload.contextStoreChainId || null;

        if (!userId) return Response.json({ error: "User ID required" }, { status: 400 });

        // 1. Get Neighbors
        const edges = await base44.entities.SimilarUserEdge.filter({ user_id: userId }, '-computed_at', 30);
        // De-dupe if multiple runs exist, take latest 30 unique users
        // Assuming edges are from latest run mostly.
        
        if (edges.length === 0) {
            // Fallback: if no neighbors (brand new system), maybe return popular items?
            // For now, return empty or handle gracefully.
            return Response.json({ status: "no_neighbors" });
        }

        // 2. Fetch Neighbor Vectors
        // We need behavior vectors of neighbors to recommend items/cats/chains
        // Optimization: fetch in bulk? We don't have bulk fetch by ID list.
        // We have to iterate. Limit to top 10 neighbors for performance in this prototype.
        const topNeighbors = edges.slice(0, 10);
        
        const neighborVectors = await Promise.all(topNeighbors.map(async (edge) => {
            const snaps = await base44.entities.UserVectorSnapshot.filter({ 
                user_id: edge.neighbor_user_id, 
                vector_type: 'behavior' 
            }, '-computed_at', 1);
            return {
                user_id: edge.neighbor_user_id,
                similarity: edge.similarity,
                vector: snaps[0]?.vector_json || {}
            };
        }));

        // 3. Aggregate
        const chainScores = {};
        const catScores = {};
        const prodScores = {};

        // Get user's own purchase history to exclude
        const mySnap = await base44.entities.UserVectorSnapshot.filter({ user_id: userId, vector_type: 'behavior' }, '-computed_at', 1);
        const myPurchases = mySnap[0]?.vector_json || {};

        neighborVectors.forEach(n => {
            const vec = n.vector;
            const sim = n.similarity;
            
            for (const key in vec) {
                const val = vec[key];
                if (key.startsWith('chain_')) {
                    const id = key.replace('chain_', '');
                    chainScores[id] = (chainScores[id] || 0) + (val * sim);
                } else if (key.startsWith('cat_')) {
                    const id = key.replace('cat_', '');
                    catScores[id] = (catScores[id] || 0) + (val * sim);
                } else if (key.startsWith('prod_')) {
                    const id = key.replace('prod_', '');
                    // Exclude if user bought recently (present in my behavior vector)
                    if (!myPurchases[`prod_${id}`]) {
                        prodScores[id] = (prodScores[id] || 0) + (val * sim);
                    }
                }
            }
        });

        // 4. Rank and Create Candidates
        const runId = crypto.randomUUID(); // Or let DB generate. But we need ID for candidates. 
        // Base44 create returns the object with ID. We should create run first.
        
        const run = await base44.entities.RecommendationRun.create({
            user_id: userId,
            context_store_chain_id: contextStoreChainId,
            algorithm: edges[0].based_on === 'profile' ? 'cf_profile_cold_start' : 'hybrid_cf',
            model_version: 'v1',
            created_at: new Date().toISOString()
        });
        
        const candidates = [];

        // Helper to sort and push
        const processScores = (scores, type, limit) => {
            return Object.entries(scores)
                .sort(([, a], [, b]) => b - a)
                .slice(0, limit)
                .map(([id, score], idx) => ({
                    run_id: run.id,
                    candidate_type: type,
                    [type === 'store_chain' ? 'store_chain_id' : type === 'category' ? 'category' : 'canonical_product_id']: id,
                    score: score,
                    rank: idx + 1,
                    reason_code: 'collaborative_filtering'
                }));
        };

        const chainCands = processScores(chainScores, 'store_chain', 3);
        const catCands = processScores(catScores, 'category', 5);
        const prodCands = processScores(prodScores, 'canonical_product', 10);
        
        const allCands = [...chainCands, ...catCands, ...prodCands];
        
        // Save candidates (sequential for now as bulkCreate might not be available or stable)
        // Optimization: Promise.all
        await Promise.all(allCands.map(c => base44.entities.RecommendationCandidate.create(c)));

        return Response.json({ success: true, runId: run.id, candidates: allCands });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});