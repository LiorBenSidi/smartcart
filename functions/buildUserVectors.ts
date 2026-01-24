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
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (const key of allKeys) {
        const a = vecA[key] || 0;
        const b = vecB[key] || 0;
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }
    
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Admin or Service Role required for bulk operations
        // If userId is provided, we can allow user to rebuild their own
        const payload = await req.json().catch(() => ({}));
        const mode = payload.mode || 'full'; // 'full' = rebuild from scratch, 'incremental' = update based on recent changes
        
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
                // INCREMENTAL MODE: Check if we can skip based on recent changes
                if (mode === 'incremental') {
                    // Get the latest vector snapshot for this user
                    const existingSnapshots = await base44.asServiceRole.entities.UserVectorSnapshot.filter(
                        { user_id: userId },
                        '-computed_at',
                        1
                    );
                    const lastSnapshot = existingSnapshots[0];
                    const lastComputedAt = lastSnapshot ? new Date(lastSnapshot.computed_at) : null;
                    
                    if (lastComputedAt) {
                        // Check if there are new receipts, habits, or feedback since last computation
                        const [newReceipts, newHabits, newFeedback, newUserProfile] = await Promise.all([
                            base44.asServiceRole.entities.Receipt.filter({ created_by: userId }, '-created_date', 1),
                            base44.asServiceRole.entities.UserProductHabit.filter({ created_by: userId }, '-last_calculated_at', 1),
                            base44.asServiceRole.entities.RecommendationFeedback.filter({ user_id: userId }, '-created_at', 1),
                            base44.asServiceRole.entities.UserProfile.filter({ created_by: userId }, '-updated_date', 1)
                        ]);
                        
                        const latestReceiptDate = newReceipts[0] ? new Date(newReceipts[0].created_date) : null;
                        const latestHabitDate = newHabits[0] ? new Date(newHabits[0].last_calculated_at) : null;
                        const latestFeedbackDate = newFeedback[0] ? new Date(newFeedback[0].created_at) : null;
                        const latestUserProfileDate = newUserProfile[0] ? new Date(newUserProfile[0].updated_date) : null;
                        
                        const hasNewData = 
                            (latestReceiptDate && latestReceiptDate > lastComputedAt) ||
                            (latestHabitDate && latestHabitDate > lastComputedAt) ||
                            (latestFeedbackDate && latestFeedbackDate > lastComputedAt) ||
                            (latestUserProfileDate && latestUserProfileDate > lastComputedAt);
                        
                        if (!hasNewData) {
                            console.log(`[buildUserVectors] INCREMENTAL: No new data for ${userId} since ${lastComputedAt.toISOString()}, skipping`);
                            results.push({ userId, status: 'skipped', mode: 'incremental', reason: 'no_new_data' });
                            continue;
                        }
                        console.log(`[buildUserVectors] INCREMENTAL: Found new data for ${userId}, rebuilding vectors`);
                    } else {
                        console.log(`[buildUserVectors] INCREMENTAL: No existing snapshot for ${userId}, building from scratch`);
                    }
                }
                
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
                    if (profile.dietary_restrictions && Array.isArray(profile.dietary_restrictions)) {
                        profile.dietary_restrictions.forEach(r => profileVec[`dietRestrict_${r}`] = 1.0);
                    }
                    if (profile.health_preferences && Array.isArray(profile.health_preferences)) {
                        profile.health_preferences.forEach(h => profileVec[`healthPref_${h}`] = 0.8);
                    }
                    if (profile.preferred_store_chains && Array.isArray(profile.preferred_store_chains)) {
                        profile.preferred_store_chains.forEach(c => profileVec[`prefChain_${c}`] = 0.7);
                    }
                    if (profile.age_range) profileVec[`age_${profile.age_range}`] = 0.5;
                    if (profile.user_role) profileVec[`role_${profile.user_role}`] = 0.5;
                }
                profileVec = normalizeVector(profileVec);

                // Save Profile Vector
                await base44.asServiceRole.entities.UserVectorSnapshot.create({
                    user_id: userId,
                    vector_type: "profile",
                    vector_json: profileVec,
                    computed_at: new Date().toISOString()
                });

                // 2. Build Behavior Vector from multiple data sources
                const [receipts, habits, savedCarts, productPrefs, tipFeedback, recFeedback] = await Promise.all([
                    base44.asServiceRole.entities.Receipt.filter({ created_by: userId }, '-purchased_at', 100),
                    base44.asServiceRole.entities.UserProductHabit.filter({ created_by: userId }, '-purchase_count', 200),
                    base44.asServiceRole.entities.SavedCart.filter({ created_by: userId }, '-created_date', 50),
                    base44.asServiceRole.entities.UserProductPreference.filter({ created_by: userId }),
                    base44.asServiceRole.entities.SmartTipFeedback.filter({ created_by: userId }),
                    base44.asServiceRole.entities.RecommendationFeedback.filter({ user_id: userId }, '-created_at', 100)
                ]);
                
                let behaviorVec = {};
                
                // From receipts - store preferences and spending patterns
                receipts.forEach(receipt => {
                    const daysAgo = (new Date() - new Date(receipt.purchased_at || new Date())) / (1000 * 60 * 60 * 24);
                    const weight = Math.exp(-daysAgo / 30);
                    if (receipt.store_id) behaviorVec[`store_${receipt.store_id}`] = (behaviorVec[`store_${receipt.store_id}`] || 0) + weight;
                    if (receipt.storeName) behaviorVec[`storeName_${receipt.storeName}`] = (behaviorVec[`storeName_${receipt.storeName}`] || 0) + weight;
                    if (receipt.items && Array.isArray(receipt.items)) {
                        receipt.items.forEach(item => {
                            if (item.category) behaviorVec[`cat_${item.category}`] = (behaviorVec[`cat_${item.category}`] || 0) + weight;
                            if (item.code) behaviorVec[`prod_${item.code}`] = (behaviorVec[`prod_${item.code}`] || 0) + weight;
                            if (item.name) {
                                const brand = item.name.split(' ')[0];
                                if (brand && brand.length > 2) behaviorVec[`brand_${brand}`] = (behaviorVec[`brand_${brand}`] || 0) + weight * 0.5;
                            }
                        });
                    }
                });
                
                // From habits - product preferences with stronger signal
                habits.forEach(habit => {
                    const purchaseWeight = Math.min(habit.purchase_count || 1, 20) / 20;
                    const confidenceWeight = habit.confidence_score || 0.5;
                    const weight = purchaseWeight * confidenceWeight;
                    if (habit.product_id) behaviorVec[`prod_${habit.product_id}`] = (behaviorVec[`prod_${habit.product_id}`] || 0) + weight * 2;
                    if (habit.product_name) {
                        const brand = habit.product_name.split(' ')[0];
                        if (brand && brand.length > 2) behaviorVec[`brand_${brand}`] = (behaviorVec[`brand_${brand}`] || 0) + weight;
                    }
                });
                
                // From saved carts - intent signals
                savedCarts.forEach(cart => {
                    if (cart.store_name) behaviorVec[`storeName_${cart.store_name}`] = (behaviorVec[`storeName_${cart.store_name}`] || 0) + 0.3;
                    if (cart.items && Array.isArray(cart.items)) {
                        cart.items.forEach(item => {
                            if (item.gtin) behaviorVec[`prod_${item.gtin}`] = (behaviorVec[`prod_${item.gtin}`] || 0) + 0.5;
                            if (item.name) {
                                const brand = item.name.split(' ')[0];
                                if (brand && brand.length > 2) behaviorVec[`brand_${brand}`] = (behaviorVec[`brand_${brand}`] || 0) + 0.25;
                            }
                        });
                    }
                });
                
                // From product preferences - explicit like/dislike signals (strong)
                productPrefs.forEach(pref => {
                    const weight = pref.preference === 'like' ? 1.5 : -1.0;
                    if (pref.product_gtin) behaviorVec[`prod_${pref.product_gtin}`] = (behaviorVec[`prod_${pref.product_gtin}`] || 0) + weight;
                    if (pref.product_name) {
                        const brand = pref.product_name.split(' ')[0];
                        if (brand && brand.length > 2) behaviorVec[`brand_${brand}`] = (behaviorVec[`brand_${brand}`] || 0) + weight * 0.5;
                    }
                });
                
                // From smart tip feedback - category/tip type preferences
                tipFeedback.forEach(fb => {
                    const weight = fb.action === 'like' ? 0.5 : -0.3;
                    if (fb.tip_type) behaviorVec[`tipPref_${fb.tip_type}`] = (behaviorVec[`tipPref_${fb.tip_type}`] || 0) + weight;
                });
                
                // From recommendation feedback - engagement signals
                recFeedback.forEach(fb => {
                    const actionWeights = { thumbs_up: 1.0, add_to_cart: 0.8, click: 0.3, bought_later: 1.2, thumbs_down: -0.8, dismiss: -0.3, view: 0.1 };
                    const weight = actionWeights[fb.action] || 0;
                    behaviorVec[`recEngagement`] = (behaviorVec[`recEngagement`] || 0) + weight;
                });
                
                behaviorVec = normalizeVector(behaviorVec);

                await base44.asServiceRole.entities.UserVectorSnapshot.create({
                    user_id: userId,
                    vector_type: "behavior",
                    vector_json: behaviorVec,
                    computed_at: new Date().toISOString()
                });

                results.push({ userId, status: 'success', mode });
            } catch (err) {
                console.error(`Error building vector for ${userId}:`, err);
                results.push({ userId, status: 'error', error: err.message, mode });
            }
        }

        // 3. Compute Similar Users (only after all vectors are built, i.e., last batch)
        if (!hasMore && targetUsers.length > 0) {
            console.log("Computing similar user edges...");
            
            // Get all user vectors
            const allVectors = await base44.asServiceRole.entities.UserVectorSnapshot.filter(
                { vector_type: "behavior" },
                '-computed_at',
                500
            );
            
            // Group by user_id, keep only latest
            const userVectorMap = {};
            allVectors.forEach(v => {
                if (!userVectorMap[v.user_id] || new Date(v.computed_at) > new Date(userVectorMap[v.user_id].computed_at)) {
                    userVectorMap[v.user_id] = v;
                }
            });
            
            const userIds = Object.keys(userVectorMap);
            console.log(`Found ${userIds.length} users with behavior vectors`);
            
            // Clear existing edges for processed users
            for (const targetUser of targetUsers) {
                const existingEdges = await base44.asServiceRole.entities.SimilarUserEdge.filter(
                    { user_id: targetUser.email }
                );
                for (const edge of existingEdges) {
                    await base44.asServiceRole.entities.SimilarUserEdge.delete(edge.id);
                }
            }
            
            // Compute similarities for each processed user
            const edgesToCreate = [];
            for (const targetUser of targetUsers) {
                const userId = targetUser.email;
                const userVec = userVectorMap[userId]?.vector_json;
                if (!userVec || Object.keys(userVec).length === 0) continue;
                
                const similarities = [];
                for (const otherId of userIds) {
                    if (otherId === userId) continue;
                    const otherVec = userVectorMap[otherId]?.vector_json;
                    if (!otherVec || Object.keys(otherVec).length === 0) continue;
                    
                    const sim = cosineSimilarity(userVec, otherVec);
                    if (sim >= 0.1) { // Minimum threshold
                        similarities.push({ neighborId: otherId, similarity: sim });
                    }
                }
                
                // Sort and keep top 10
                similarities.sort((a, b) => b.similarity - a.similarity);
                const topSimilar = similarities.slice(0, 10);
                
                for (const s of topSimilar) {
                    edgesToCreate.push({
                        user_id: userId,
                        neighbor_user_id: s.neighborId,
                        similarity: s.similarity,
                        based_on: "behavior",
                        computed_at: new Date().toISOString()
                    });
                }
                
                console.log(`User ${userId}: Found ${topSimilar.length} similar users`);
            }
            
            // Bulk create edges
            if (edgesToCreate.length > 0) {
                await base44.asServiceRole.entities.SimilarUserEdge.bulkCreate(edgesToCreate);
                console.log(`Created ${edgesToCreate.length} similarity edges`);
            }
        }

        return Response.json({
            success: true,
            hasMore: hasMore,
            results: results,
            message: `Processed ${targetUsers.length} users`,
            mode
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});