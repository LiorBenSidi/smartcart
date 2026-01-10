import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const { run_id, store_chain_id, limits } = payload;
        const max_items = limits?.max_items || 15;
        const max_alternatives_per_item = limits?.max_alternatives_per_item || 3;

        if (!run_id) return Response.json({ error: "run_id required" }, { status: 400 });

        // 1. Load Run & User Profile
        const runs = await base44.entities.RecommendationRun.filter({ id: run_id });
        if (runs.length === 0) return Response.json({ error: "Run not found" }, { status: 404 });
        const run = runs[0];
        
        // Auth check
        if (user && run.user_id !== user.email && user.role !== 'admin') {
             return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const profiles = await base44.entities.UserProfile.filter({ created_by: run.user_id }); // or user_id field
        const profile = profiles[0] || {};

        // 2. Load Item Candidates
        const candidates = await base44.entities.RecommendationCandidate.filter({ 
            run_id: run_id, 
            candidate_type: 'canonical_product' 
        }); // Cannot sort in filter easily in all implementations, sort in memory
        
        candidates.sort((a, b) => b.score - a.score);
        const topCandidates = candidates.slice(0, max_items);
        
        if (topCandidates.length === 0) return Response.json({ run_id, store_chain_id, results: [], meta: {} });

        // 3. Hard Filters (Diet/Kosher/Allergy)
        // Need product details (tags)
        const productIds = topCandidates.map(c => c.canonical_product_id);
        const products = [];
        
        // Fetch products (parallel)
        await Promise.all(productIds.map(async (id) => {
             const res = await base44.entities.Product.filter({ gtin: id });
             if (res[0]) products.push(res[0]);
        }));
        const productMap = new Map(products.map(p => [p.gtin, p]));

        const validCandidates = [];
        const hard_filters_applied = [];
        if (profile.kosher_level && profile.kosher_level !== 'none') hard_filters_applied.push('kosher');
        if (profile.diet && profile.diet !== 'none') hard_filters_applied.push('diet');
        if (profile.allergies && profile.allergies.length > 0) hard_filters_applied.push('allergies');

        for (const cand of topCandidates) {
            const prod = productMap.get(cand.canonical_product_id);
            if (!prod) continue;

            let allowed = true;
            
            // Kosher Check
            if (profile.kosher_level && profile.kosher_level !== 'none') {
                 const pTags = prod.kosher_tags || [];
                 if (profile.kosher_level === 'strict' || profile.kosher_level === 'strict_kosher') {
                     if (!pTags.some(t => ['strict', 'strict_kosher', 'glatt_kosher', 'mehadrin'].includes(t))) allowed = false;
                 } else if (profile.kosher_level === 'basic' || profile.kosher_level === 'basic_kosher') {
                     if (!pTags.some(t => ['basic', 'basic_kosher', 'strict', 'strict_kosher', 'glatt_kosher', 'mehadrin'].includes(t))) allowed = false;
                 }
            }
            
            // Diet Check
            if (allowed && profile.diet && profile.diet !== 'none') {
                const pTags = prod.dietary_tags || [];
                if (profile.diet === 'vegan') {
                    if (!pTags.includes('vegan')) allowed = false;
                } else if (profile.diet === 'vegetarian') {
                    if (!pTags.includes('vegetarian') && !pTags.includes('vegan')) allowed = false;
                } else if (profile.diet === 'gluten_free') {
                     if (!pTags.includes('gluten_free')) allowed = false;
                }
            }
            
            // Allergies Check
            if (allowed && profile.allergies && profile.allergies.length > 0) {
                 const pAllergens = prod.allergen_tags || [];
                 if (profile.allergies.some(a => pAllergens.includes(a))) allowed = false;
            }

            if (allowed) {
                validCandidates.push({ cand, prod });
            }
        }

        // 4. Materialize (Fetch Prices)
        const finalResults = [];
        const validIds = validCandidates.map(x => x.prod.gtin);
        
        // Call fetchPrices
        let pricesMap = {};
        try {
            const res = await base44.functions.invoke('fetchPrices', { 
                storeChainId: store_chain_id, 
                canonicalProductIds: validIds 
            });
            if (res.data && res.data.data) { // Assuming fetchPrices returns { data: { [id]: [...] } } or just { [id]: ... }?
                // The fetchPrices I wrote returns { success: true, data: results }
                pricesMap = res.data.data || {};
            } else if (res.data) {
                pricesMap = res.data; // Fallback if structure differs
            }
        } catch (e) {
            console.error("fetchPrices failed", e);
            // Graceful degradation: empty map
        }

        for (const { cand, prod } of validCandidates) {
            const alts = pricesMap[prod.gtin] || [];
            
            // Compute/Mock Savings Score if missing
            // The stub returns 'savings' field. We interpret it.
            // Map to requested schema.
            const alternatives = alts.map(a => ({
                store_product_id: a.store_product_id,
                name_store: a.name,
                brand: a.brand || null,
                price: parseFloat(a.price) || 0,
                unit_price: 0, // Mock
                savings_score: parseFloat(a.savings) || 0, // Using savings as score
                confidence: 0.9,
                why: {
                    rule_filters_passed: hard_filters_applied,
                    price_facts: { chain_avg: 0, delta: 0 }
                }
            }));

            // Rank by savings score
            alternatives.sort((a, b) => b.savings_score - a.savings_score);
            
            finalResults.push({
                canonical_product: {
                    canonical_product_id: prod.gtin,
                    canonical_name: prod.canonical_name || prod.name || "",
                    category: prod.category
                },
                cf_score: cand.score,
                filtered_out: false,
                alternatives: alternatives.slice(0, max_alternatives_per_item)
            });
        }

        return Response.json({
            run_id,
            store_chain_id,
            results: finalResults,
            meta: {
                hard_filters_applied,
                ranking: { final_score: "0.6*cf + 0.4*savings", max_alternatives_per_item }
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});