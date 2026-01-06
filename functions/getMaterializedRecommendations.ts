import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Stub for external price DB
async function fetchPricesStub(base44, chainId, productIds) {
    // In real app, call external API or specialized query
    // Here, return mock data
    const results = {};
    const timestamp = new Date().toISOString();
    
    // Attempt to fetch real prices from ProductPrice entity if exists? 
    // The context has ProductPrice entity. Let's try to use it if chainId is provided.
    
    if (chainId) {
        // This is efficient only if we loop or have "in" query. Base44 list/filter is simple.
        // We'll mock for now as requested "Stub / Notes".
        // "return mock prices when the DB is not configured"
    }

    productIds.forEach(id => {
        // Generate 3 alternatives
        results[id] = [
            {
                store_product_id: `${id}_A`,
                name: `Store Brand ${id}`,
                price: (Math.random() * 10 + 5).toFixed(2),
                savings: (Math.random() * 2).toFixed(2),
                tags: ["store_brand"]
            },
            {
                store_product_id: `${id}_B`,
                name: `Premium ${id}`,
                price: (Math.random() * 10 + 10).toFixed(2),
                savings: 0,
                tags: ["organic"]
            }
        ];
    });
    return results;
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const { runId, chosenStoreChainId } = payload;
        
        if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

        // 1. Fetch Candidates
        const candidates = await base44.entities.RecommendationCandidate.filter({ 
            run_id: runId, 
            candidate_type: 'canonical_product' 
        });
        
        if (candidates.length === 0) return Response.json({ items: [] });
        
        // 2. Fetch User Profile
        // Assuming user.email is the id/key
        const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
        const profile = profiles[0] || {};
        
        // 3. Fetch Products for Metadata (Tags)
        // Need to fetch products to check tags. 
        const productIds = candidates.map(c => c.canonical_product_id);
        
        // Helper to fetch multiple products
        // We'll fetch all products? No, filter.
        // Base44 doesn't support "in" array filter easily in all versions.
        // We'll fetch list and filter in memory if list is small, or loop fetch.
        // For prototype, assuming product count is small (top 10 candidates).
        
        const productDetails = await Promise.all(productIds.map(id => 
             base44.entities.Product.filter({ gtin: id }).then(res => res[0])
        ));
        
        // 4. Guardrails (Filter)
        const validCandidates = [];
        
        for (let i = 0; i < candidates.length; i++) {
            const cand = candidates[i];
            const prod = productDetails[i];
            
            if (!prod) continue;
            
            let allowed = true;
            
            // Kosher Check
            if (profile.kosher_level && profile.kosher_level !== 'none') {
                 const pTags = prod.kosher_tags || [];
                 // Simple logic: if profile is strict, product must have strict.
                 // if profile is basic, product can have basic or strict.
                 if (profile.kosher_level === 'strict' || profile.kosher_level === 'strict_kosher' || profile.kosher_level === 'glatt_kosher') {
                     if (!pTags.some(t => ['strict', 'strict_kosher', 'glatt_kosher', 'mehadrin'].includes(t))) allowed = false;
                 } else if (profile.kosher_level === 'basic' || profile.kosher_level === 'basic_kosher') {
                     if (!pTags.some(t => ['basic', 'basic_kosher', 'strict', 'strict_kosher', 'glatt_kosher', 'mehadrin'].includes(t))) allowed = false;
                 }
            }
            
            // Diet Check
            if (allowed && profile.diet && profile.diet !== 'none') {
                const pTags = prod.dietary_tags || [];
                // if vegan, need vegan. if vegetarian, need vegetarian OR vegan.
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
        
        // 5. Fetch Prices and Alternatives
        const finalResults = [];
        const validIds = validCandidates.map(x => x.cand.canonical_product_id);
        const pricesMap = await fetchPricesStub(base44, chosenStoreChainId, validIds);
        
        for (const { cand, prod } of validCandidates) {
            const alts = pricesMap[prod.gtin] || [];
            
            // Sort alternatives by savings/price (assuming lower price/high savings is better)
            // Stubs return random savings.
            alts.sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings));
            
            finalResults.push({
                canonical_product: prod,
                alternatives: alts.slice(0, 3), // Max 3
                score: cand.score,
                reason: cand.reason_code
            });
        }

        // Return Materialized JSON
        return Response.json({ 
            success: true, 
            recommendations: finalResults 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});