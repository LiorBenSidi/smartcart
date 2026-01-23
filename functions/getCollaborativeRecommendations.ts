import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const collaborativeSuggestions = [];
        
        // Use service role to access cross-user data (vectors and edges are created by service role)
        // Check for user vectors (stored by user_id field, not created_by)
        const userVectors = await base44.asServiceRole.entities.UserVectorSnapshot.filter({ user_id: user.email }, '-computed_at', 1).catch(() => []);
        console.log(`[CF] User ${user.email}: Found ${userVectors.length} vector snapshots`);

        if (userVectors.length === 0) {
            console.log(`[CF] No user vectors found - run "Rebuild User Vectors" first`);
            return Response.json({ 
                success: true, 
                recommendations: [],
                debug: { reason: "no_user_vectors", message: "Run 'Rebuild User Vectors' from Admin panel first" }
            });
        }

        // Get similar users (stored by user_id field, created by service role)
        const similarUsers = await base44.asServiceRole.entities.SimilarUserEdge.filter(
            { user_id: user.email },
            '-similarity',
            10
        ).catch(() => []);
        console.log(`[CF] Found ${similarUsers.length} similar users for ${user.email}`);

        if (similarUsers.length === 0) {
            console.log(`[CF] No similar users found - need more users with vectors`);
            return Response.json({ 
                success: true, 
                recommendations: [],
                debug: { reason: "no_similar_users", message: "No similar users found. Need more users with purchase history." }
            });
        }

        // Build a map of neighbor similarity scores
        const neighborSimilarityMap = {};
        similarUsers.forEach(su => {
            neighborSimilarityMap[su.neighbor_user_id] = su.similarity;
        });
        const neighborIds = Object.keys(neighborSimilarityMap);
        console.log(`[CF] Processing ${neighborIds.length} neighbors: ${neighborIds.join(', ')}`);

        // Get current user's purchased products to exclude them from recommendations
        // For new users with no habits, we should still recommend products
        const userHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
            { created_by: user.email },
            '-purchase_count',
            200
        ).catch(() => []);
        
        // Also check user_id field for habits
        let userHabitsByUserId = [];
        if (userHabits.length === 0) {
            userHabitsByUserId = await base44.asServiceRole.entities.UserProductHabit.filter(
                { user_id: user.email },
                '-purchase_count',
                200
            ).catch(() => []);
        }
        
        const allUserHabits = [...userHabits, ...userHabitsByUserId];
        const userPurchasedProducts = new Set(allUserHabits.map(h => h.product_id));
        console.log(`[CF] User has purchased ${userPurchasedProducts.size} unique products (${userHabits.length} by created_by, ${userHabitsByUserId.length} by user_id)`);

        // Get top products purchased by similar users (habits are created by individual users)
        for (const neighborId of neighborIds) {
            const similarity = neighborSimilarityMap[neighborId];
            
            // UserProductHabit is created by users, use service role to access other users' habits
            let neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                { created_by: neighborId },
                '-purchase_count',
                20
            ).catch(() => []);
            
            // If no habits via created_by, also try user_id field
            if (neighborHabits.length === 0) {
                neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                    { user_id: neighborId },
                    '-purchase_count',
                    20
                ).catch(() => []);
            }
            console.log(`[CF] Neighbor ${neighborId} (similarity: ${similarity.toFixed(3)}): Found ${neighborHabits.length} habits`);

            neighborHabits.forEach(habit => {
                // Skip products the user has already purchased
                if (userPurchasedProducts.has(habit.product_id)) return;
                
                // Confidence = neighbor_similarity * habit_confidence * purchase_frequency_factor
                const purchaseFrequencyFactor = Math.min(1, (habit.purchase_count || 1) / 5); // Normalize by 5 purchases
                const habitConfidence = habit.confidence_score || 0.5;
                const confidence = similarity * habitConfidence * (0.5 + 0.5 * purchaseFrequencyFactor);
                
                collaborativeSuggestions.push({
                    product_id: habit.product_id,
                    product_name: habit.product_name,
                    suggested_qty: Math.round(habit.avg_quantity) || 1,
                    reason_type: "Collaborative",
                    confidence: confidence,
                    evidence: {
                        similar_users_count: 1,
                        neighbor_similarity: similarity,
                        neighbor_purchase_count: habit.purchase_count || 1,
                        source: "similar_neighbors"
                    }
                });
            });
        }

        // Aggregate by product_id to remove duplicates and boost confidence
        const aggregated = {};
        collaborativeSuggestions.forEach(item => {
            if (!aggregated[item.product_id]) {
                aggregated[item.product_id] = { ...item };
            } else {
                // Boost confidence based on additional neighbors recommending the same product
                // Use weighted average based on similarity scores
                const existing = aggregated[item.product_id];
                const totalSimilarity = existing.evidence.neighbor_similarity + item.evidence.neighbor_similarity;
                existing.confidence = Math.min(0.95, existing.confidence + item.confidence * 0.5);
                existing.evidence.similar_users_count += 1;
                existing.evidence.neighbor_similarity = totalSimilarity / existing.evidence.similar_users_count;
                existing.evidence.neighbor_purchase_count = Math.max(
                    existing.evidence.neighbor_purchase_count, 
                    item.evidence.neighbor_purchase_count
                );
            }
        });

        // Sort by confidence and return top recommendations
        const results = Object.values(aggregated)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 15);
        console.log(`[CF] Returning ${results.length} aggregated recommendations (filtered from ${Object.keys(aggregated).length})`);
        return Response.json({ success: true, recommendations: results });

        } catch (error) {
            return Response.json({ error: error.message }, { status: 500 });
        }
});