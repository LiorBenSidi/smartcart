import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const { userId } = payload;

        if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

        // 1. Fetch User Receipts
        const receipts = await base44.entities.Receipt.filter({ created_by: userId });
        
        if (receipts.length === 0) {
            return Response.json({ message: "No receipts found, skipping vector computation" });
        }

        // 2. Build Profile Vector
        // Dimensions:
        // - cat_{category}: spend amount
        // - chain_{chain_id}: visit count
        // - prod_{product_id}: quantity
        
        const vector = {};
        
        for (const r of receipts) {
            // Store/Chain Preference
            // Receipt has store_id. Need to fetch Store to get chain_id.
            // Optimization: Maybe we can get chain_id from items if denormalized? 
            // ReceiptItem has store_chain_id.
            // Let's rely on Receipt items if available, or fetch Store.
            // Checking Receipt schema... Receipt has store_id.
            // Let's try to get chain_id from store_id.
            // This N+1 is bad. Let's hope for few stores or cache.
            // For MVP, we'll skip chain dimension from Receipt header if too costly, 
            // but ReceiptItem has store_chain_id. Let's iterate items.
            
            // Fetch items for receipt
            // Assuming Receipt.items is populated or we need to fetch ReceiptItem separately.
            // Schema says Receipt has "items" array property.
            
            if (r.items && Array.isArray(r.items)) {
                r.items.forEach(item => {
                     // Category Spend
                     if (item.category) {
                         const key = `cat_${item.category}`;
                         vector[key] = (vector[key] || 0) + (item.total || 0);
                     }
                     
                     // Product Frequency
                     if (item.product_id) { // Canonical ID
                         const key = `prod_${item.product_id}`;
                         vector[key] = (vector[key] || 0) + (item.quantity || 1);
                     }

                     // Chain Preference (if available in item)
                     if (item.store_chain_id) {
                         const key = `chain_${item.store_chain_id}`;
                         vector[key] = (vector[key] || 0) + 1;
                     }
                });
            }
        }

        // Normalize Vector (Simple L2 or Sum normalization? Let's do Max scaling for simplicity)
        const maxVal = Math.max(...Object.values(vector), 1);
        Object.keys(vector).forEach(k => vector[k] /= maxVal);

        // 3. Store/Update UserProfileVector
        const existingVectors = await base44.entities.UserProfileVector.filter({ user_id: userId });
        if (existingVectors.length > 0) {
            await base44.entities.UserProfileVector.update(existingVectors[0].id, {
                vector_json: vector,
                updated_at: new Date().toISOString(),
                receipt_count_cached: receipts.length
            });
        } else {
            await base44.entities.UserProfileVector.create({
                user_id: userId,
                vector_json: vector,
                updated_at: new Date().toISOString(),
                receipt_count_cached: receipts.length
            });
        }

        // 4. Compute Similarity (Naive O(N) scan for now)
        // In prod, use a Vector DB (Pinecone/Milvus) or LSH.
        // Here, we fetch all other vectors. WARNING: Scales poorly. 
        // For < 1000 users it's fine.
        
        // Fetch recent vectors (active users)
        const allVectors = await base44.entities.UserProfileVector.list({ limit: 1000 }); // Cap at 1000
        const scores = {};
        
        const dotProduct = (v1, v2) => {
            let sum = 0;
            for (const k in v1) {
                if (v2[k]) sum += v1[k] * v2[k];
            }
            return sum;
        };

        allVectors.forEach(other => {
            if (other.user_id === userId) return;
            if (!other.vector_json) return;
            
            const sim = dotProduct(vector, other.vector_json);
            if (sim > 0.01) { // Threshold
                scores[other.user_id] = sim;
            }
        });

        // Top K
        const sortedUsers = Object.entries(scores)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 20); // Top 20

        const similarUserIds = sortedUsers.map(([uid]) => uid);
        
        // Store SimilarUserIndex
        const existingIndex = await base44.entities.SimilarUserIndex.filter({ user_id: userId });
        if (existingIndex.length > 0) {
            await base44.entities.SimilarUserIndex.update(existingIndex[0].id, {
                similar_user_ids: similarUserIds,
                scores_json: scores,
                updated_at: new Date().toISOString()
            });
        } else {
            await base44.entities.SimilarUserIndex.create({
                user_id: userId,
                similar_user_ids: similarUserIds,
                scores_json: scores,
                updated_at: new Date().toISOString()
            });
        }

        return Response.json({ success: true, similar_count: similarUserIds.length });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});