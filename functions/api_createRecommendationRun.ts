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
        
        const user_lat = context.user_lat;
        const user_lon = context.user_lon;
        const current_store_id = context.current_store_id;

        const lookback_days = options.lookback_days || 90;
        const exclude_recent_days = options.exclude_recent_days || 10;
        const cold_start_min_receipts = options.cold_start_min_receipts || 3;

        // Helper: Haversine Distance
        const getDistanceKm = (lat1, lon1, lat2, lon2) => {
            if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
            const R = 6371; 
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        };

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

        // --- CONTEXT AUGMENTATION ---
        
        // A. Location Boost (Stores)
        if (user_lat && user_lon) {
            // Fetch all stores (or cache? list() is fine for now)
            // Ideally we query stores near bbox, but list() is okay for proto.
            const allStores = await base44.entities.Store.list();
            const chainMinDist = {};

            allStores.forEach(s => {
                const d = getDistanceKm(user_lat, user_lon, s.latitude, s.longitude);
                if (d < 50) { // Only consider stores within 50km
                    if (!chainMinDist[s.chain_id] || d < chainMinDist[s.chain_id]) {
                        chainMinDist[s.chain_id] = d;
                    }
                }
            });

            // Boost logic: Closer = Higher boost
            // 0km = 1.0 boost, 10km = 0.5 boost, 50km = 0 boost
            Object.entries(chainMinDist).forEach(([chainId, dist]) => {
                const boost = Math.max(0, 1 - (dist / 20)); // Linear decay up to 20km
                if (boost > 0) {
                    chainScores[chainId] = (chainScores[chainId] || 0) + boost;
                }
            });
        }

        // B. Promotion/Inventory Boost (Products)
        // Fetch active promotions
        const now = new Date().toISOString();
        const activePromos = await base44.entities.Promotion.filter({
            starts_at: { $lte: now },
            ends_at: { $gte: now }
        });
        
        // If current_store_id provided, fetch its specific pricing/inventory
        let storePrices = [];
        if (current_store_id) {
            storePrices = await base44.entities.ProductPrice.filter({ store_id: current_store_id });
        }

        // Apply Boosts
        // 1. Global Promo Boost (if no specific store or generic chain promos)
        // Map promos to products? Promos usually linked to products?
        // Schema: Promotion has chain_id, store_id. It describes discount. 
        // It doesn't strictly link to GTIN in the schema provided (Relation? No, just name/desc). 
        // Assuming "name" or description matches or we need a join table.
        // Wait, schema check: Promotion -> properties: name, description... no product_id?
        // Ah, typically promos are complex. Let's assume for this proto we don't link promos to GTINs easily 
        // without a separate lookup or if `ProductPrice` has `is_promoted` flag?
        // `ProductPrice` schema has `allow_discount`. 
        // Let's rely on `storePrices` if available.
        
        if (current_store_id && storePrices.length > 0) {
            storePrices.forEach(p => {
                if (p.availability_status === 'out_of_stock') {
                    // Penalize heavily
                    if (prodScores[p.gtin]) prodScores[p.gtin] *= 0.1;
                } else {
                     // Boost if price is good? Or just boost availability?
                     // Let's slight boost available items in current store
                     prodScores[p.gtin] = (prodScores[p.gtin] || 0) + 0.2;
                }
            });
        }

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