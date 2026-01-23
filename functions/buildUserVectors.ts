import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeVector(vec) {
    let sumSq = 0;
    for (const key in vec) sumSq += vec[key] * vec[key];
    const magnitude = Math.sqrt(sumSq);
    if (magnitude === 0) return vec;
    const normalized = {};
    for (const key in vec) normalized[key] = vec[key] / magnitude;
    return normalized;
}

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;
    let dot = 0;
    for (const key in vecA) {
        if (vecB[key]) {
            dot += vecA[key] * vecB[key];
        }
    }
    return dot;
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Admin or Service Role required for bulk operations
        // If userId is provided, we can allow user to rebuild their own
        const payload = await req.json().catch(() => ({}));
        
        let targetUsers = [];
        let hasMore = false;

        if (payload.userId) {
            // Single user mode
            targetUsers = [{ email: payload.userId }];
            hasMore = false;
        } else {
            // Batch mode
            if (!user || user.role !== 'admin') {
                return Response.json({ error: "Admin access required for bulk operation" }, { status: 403 });
            }
            const batch = payload.batch || 0;
            const limit = payload.limit || 10;
            const skip = batch * limit;
            
            // Use asServiceRole to ensure we can list all users if needed, 
            // though entities.User.list might work for admin.
            // Using base44.asServiceRole.entities.User might not be available, User entity is special.
            // But base44.entities.User.list() works for admin.
            const users = await base44.entities.User.list('', limit, skip);
            targetUsers = users;
            hasMore = users.length === limit;
            console.log(`Building vectors for batch ${batch}, found ${users.length} users`);
        }

        const results = [];

        for (const targetUser of targetUsers) {
            const userId = targetUser.email;
            try {
                // 1. Build Profile Vector
                // Use service role to access profiles created by other users if needed
                const profiles = await base44.asServiceRole.entities.UserProfile.filter({ created_by: userId });
                const profile = profiles[0];
                
                let profileVec = {};
                if (profile) {
                    if (profile.kosher_level && profile.kosher_level !== 'none') profileVec[`kosher_${profile.kosher_level}`] = 1.0;
                    if (profile.diet && profile.diet !== 'none') profileVec[`diet_${profile.diet}`] = 1.0;
                    const size = profile.household_size || 1;
                    profileVec[`household_size`] = Math.min(size, 10) / 10.0;
                    const budgetMap = { "low": 0.0, "save_money": 0.0, "medium": 0.5, "balanced": 0.5, "high": 1.0, "health_focused": 0.8 };
                    profileVec[`budget_score`] = budgetMap[profile.budget_focus] || 0.5;
                    if (profile.allergies && Array.isArray(profile.allergies)) {
                        profile.allergies.forEach(a => profileVec[`allergy_${a}`] = 1.0);
                    }
                }
                profileVec = normalizeVector(profileVec);

                // Save Profile Vector
                await base44.asServiceRole.entities.UserVectorSnapshot.create({
                    user_id: userId,
                    vector_type: "profile",
                    vector_json: profileVec,
                    computed_at: new Date().toISOString()
                });

                // 2. Build Behavior Vector
                // Using service role to access receipt items of any user
                const items = await base44.asServiceRole.entities.ReceiptItem.filter({ created_by: userId }, '-purchased_at', 200);
                
                let behaviorVec = {};
                items.forEach(item => {
                    const daysAgo = (new Date() - new Date(item.purchased_at || new Date())) / (1000 * 60 * 60 * 24);
                    const weight = Math.exp(-daysAgo / 14);
                    if (item.category) behaviorVec[`cat_${item.category}`] = (behaviorVec[`cat_${item.category}`] || 0) + weight;
                    if (item.product_id) behaviorVec[`prod_${item.product_id}`] = (behaviorVec[`prod_${item.product_id}`] || 0) + weight;
                    if (item.store_chain_id) behaviorVec[`chain_${item.store_chain_id}`] = (behaviorVec[`chain_${item.store_chain_id}`] || 0) + weight;
                });
                behaviorVec = normalizeVector(behaviorVec);

                await base44.asServiceRole.entities.UserVectorSnapshot.create({
                    user_id: userId,
                    vector_type: "behavior",
                    vector_json: behaviorVec,
                    computed_at: new Date().toISOString()
                });

                results.push({ userId, status: 'success' });
            } catch (err) {
                console.error(`Error building vector for ${userId}:`, err);
                results.push({ userId, status: 'error', error: err.message });
            }
        }

        return Response.json({
            success: true,
            hasMore: hasMore,
            results: results,
            message: `Processed ${targetUsers.length} users`
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});