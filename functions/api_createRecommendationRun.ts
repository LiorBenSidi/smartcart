import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const payload = await req.json().catch(() => ({}));
        
        // Input Parsing & Defaults
        const userId = payload.user_id || user.email;
        const context = payload.context || {};
        const options = payload.options || {};
        
        const k_items = context.k_items || 30;
        const k_categories = context.k_categories || 5;
        const k_stores = context.k_stores || 3;
        
        const lookback_days = options.lookback_days || 90;
        const exclude_recent_days = options.exclude_recent_days || 10;
        const cold_start_min_receipts = options.cold_start_min_receipts || 3;

        // 1. Determine Algorithm (Cold vs Warm)
        // Check receipt count in last 60 days
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        
        const recentReceipts = await base44.entities.Receipt.filter({ 
            created_by: userId, // Assuming created_by maps to user_id concept
            purchased_at: { $gte: sixtyDaysAgo.toISOString() } 
        });

        const algorithm = recentReceipts.length < cold_start_min_receipts 
            ? "cf_profile_cold_start" 
            : "cf_behavior_warm_start";

        // 2. Freshness Check (Vectors & Neighbors)
        // Check if recent snapshot exists (e.g. last 24h)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        
        const snapshots = await base44.entities.UserVectorSnapshot.filter({
            user_id: userId,
            computed_at: { $gte: oneDayAgo.toISOString() }
        });

        if (snapshots.length === 0) {
            // Recompute on demand
            await base44.functions.invoke('buildUserVectors', { userId });
            await base44.functions.invoke('computeSimilarUsers', { userId });
        }

        // 3. Get Neighbors
        const edges = await base44.entities.SimilarUserEdge.filter({ 
            user_id: userId,
            // Filter by based_on? If algorithm is profile_cold_start, prefer profile based neighbors?
            // The existing computeSimilarUsers stores 'based_on'.
            // Simple logic: fetch all, sort by similarity, or filter if 'based_on' is critical.
            // Let's fetch all and let similarity dictate, or filter if possible.
            // based_on: algorithm === 'cf_profile_cold_start' ? 'profile' : 'behavior' // Optional refinement
        }, '-similarity', k_items); // Top K neighbors

        if (edges.length === 0) {
            return Response.json({ 
                run: { id: null, algorithm, status: "no_neighbors" }, 
                candidates: { stores: [], categories: [], items: [] } 
            });
        }

        // 4. Aggregate Candidates
        const chainScores = {};
        const catScores = {};
        const prodScores = {};

        // Fetch exclude list (my recent purchases)
        const excludeDate = new Date();
        excludeDate.setDate(excludeDate.getDate() - exclude_recent_days);
        
        // Fetch my recent receipt items to exclude
        // This query might be heavy if many receipts. 
        // Optimization: rely on behavior vector which encodes recent purchases? 
        // Or just fetch recent receipts headers then items.
        // For prototype, we'll skip detailed exclusion or do a simple fetch.
        const myRecentReceipts = await base44.entities.Receipt.filter({
            created_by: userId,
            purchased_at: { $gte: excludeDate.toISOString() }
        });
        const myRecentReceiptIds = myRecentReceipts.map(r => r.id);
        // We need items. Fetch items for these receipts? 
        // If Receipt has 'items' json field (from schema), we use that.
        // Schema says Receipt has 'items' array.
        const excludeProductIds = new Set();
        myRecentReceipts.forEach(r => {
            if (r.items) {
                r.items.forEach(i => {
                    if (i.product_id) excludeProductIds.add(i.product_id); // Assuming product_id is canonical
                    if (i.code) excludeProductIds.add(i.code); // Fallback
                });
            }
        });

        // Fetch Neighbors' Vectors to aggregate
        // Logic copied from generateCollaborativeRecommendations but adapted
        // We need behavior vectors of neighbors.
        const topNeighbors = edges.slice(0, 10); // Limit to 10 for performance
        
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
                    if (!excludeProductIds.has(id)) {
                        prodScores[id] = (prodScores[id] || 0) + (val * sim);
                    }
                }
            }
        });

        // 5. Create Run & Candidates
        const run = await base44.entities.RecommendationRun.create({
            user_id: userId,
            context_store_chain_id: context.store_chain_id,
            context_region: context.region,
            algorithm: algorithm,
            model_version: 'cf_v1',
            created_at: new Date().toISOString()
        });

        // Helper to get top keys
        const getTopKeys = (scores, limit) => Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([id, score]) => ({ id, score }));

        const topChainKeys = getTopKeys(chainScores, k_stores);
        const topCatKeys = getTopKeys(catScores, k_categories);
        const topProdKeys = getTopKeys(prodScores, k_items);

        // Validate Chains
        const validatedChains = [];
        await Promise.all(topChainKeys.map(async ({ id, score }) => {
            const res = await base44.entities.Chain.filter({ id });
            if (res.length > 0) {
                validatedChains.push({ ...res[0], score }); // Keep entity data + score
            }
        }));

        // Validate Products
        const validatedProducts = [];
        await Promise.all(topProdKeys.map(async ({ id, score }) => {
            const res = await base44.entities.Product.filter({ gtin: id }); // Assuming vector uses GTIN/Canonical ID
            if (res.length > 0) {
                validatedProducts.push({ ...res[0], score });
            }
        }));

        // Categories (No DB entity usually, but pass through)
        const validatedCategories = topCatKeys.map(k => ({ category: k.id, score: k.score }));

        // Prepare Candidates for DB
        const dbCandidates = [];
        
        validatedChains.forEach((c, idx) => {
            dbCandidates.push({
                run_id: run.id,
                candidate_type: 'store_chain',
                store_chain_id: c.id,
                score: c.score,
                reason_code: 'collaborative_filtering',
                rank: idx + 1
            });
        });

        validatedCategories.forEach((c, idx) => {
            dbCandidates.push({
                run_id: run.id,
                candidate_type: 'category',
                category: c.category,
                score: c.score,
                reason_code: 'collaborative_filtering',
                rank: idx + 1
            });
        });

        validatedProducts.forEach((p, idx) => {
            dbCandidates.push({
                run_id: run.id,
                candidate_type: 'canonical_product',
                canonical_product_id: p.gtin,
                score: p.score,
                reason_code: 'collaborative_filtering',
                rank: idx + 1
            });
        });

        // Persist
        const createdCandidates = await Promise.all(dbCandidates.map(c => base44.entities.RecommendationCandidate.create(c)));

        // Enrich Response
        const enrich = (candidates, entities, typeField, entityIdField) => {
            return candidates.map(c => {
                const entity = entities.find(e => e[entityIdField] === c[typeField]);
                return {
                    candidate_id: c.id,
                    [typeField]: c[typeField],
                    score: c.score,
                    reason_code: c.reason_code,
                    // Enrich
                    name: entity?.name || entity?.canonical_name || c[typeField],
                    image_url: entity?.logo_url || entity?.image_url,
                    description: entity?.description
                };
            });
        };

        const responseCandidates = {
            stores: enrich(createdCandidates.filter(c => c.candidate_type === 'store_chain'), validatedChains, 'store_chain_id', 'id'),
            categories: createdCandidates.filter(c => c.candidate_type === 'category').map(c => ({ 
                candidate_id: c.id, 
                category: c.category, 
                score: c.score, 
                reason_code: c.reason_code,
                name: c.category // Categories are just strings usually
            })),
            items: enrich(createdCandidates.filter(c => c.candidate_type === 'canonical_product'), validatedProducts, 'canonical_product_id', 'gtin')
        };

        return Response.json({
            run: {
                id: run.id,
                user_id: userId,
                algorithm: algorithm,
                model_version: "cf_v1",
                created_at: run.created_at
            },
            candidates: responseCandidates
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});