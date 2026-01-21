import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const collaborativeSuggestions = [];
        
        // Check for user vectors (mock check as we might not have real vector data in this env)
        // In a real scenario, this would rely on the UserVectorSnapshot entity.
        const userVectors = await base44.entities.UserVectorSnapshot.filter({ created_by: user.email }, '-computed_at', 1).catch(() => []);

        if (userVectors.length > 0) {
            // Get similar users
            const similarUsers = await base44.entities.SimilarUserEdge.filter(
                { user_id: user.email },
                '-similarity',
                10
            ).catch(() => []);

            if (similarUsers.length > 0) {
                const neighborIds = similarUsers.map(su => su.neighbor_user_id);

                // Get top products purchased by similar users
                // We'll process each neighbor
                for (const neighborId of neighborIds) {
                    const neighborHabits = await base44.entities.UserProductHabit.filter(
                        { created_by: neighborId },
                        '-purchase_count',
                        10
                    ).catch(() => []);

                    neighborHabits.forEach(habit => {
                        collaborativeSuggestions.push({
                            product_id: habit.product_id,
                            product_name: habit.product_name,
                            suggested_qty: Math.round(habit.avg_quantity) || 1,
                            reason_type: "Collaborative",
                            // Base confidence dampened, will be boosted if multiple neighbors recommend
                            confidence: 0.5 * (habit.confidence_score || 0.5), 
                            evidence: {
                                similar_users_count: 1,
                                source: "similar_neighbors"
                            }
                        });
                    });
                }
            }
        }

        // Aggregate by product_id to remove duplicates and boost confidence
        const aggregated = {};
        collaborativeSuggestions.forEach(item => {
            if (!aggregated[item.product_id]) {
                aggregated[item.product_id] = item;
            } else {
                // Boost confidence if recommended by multiple neighbors
                // Cap at 0.9
                const newConfidence = Math.min(0.9, aggregated[item.product_id].confidence + 0.1);
                aggregated[item.product_id].confidence = newConfidence;
                aggregated[item.product_id].evidence.similar_users_count = (aggregated[item.product_id].evidence.similar_users_count || 1) + 1;
            }
        });

        return Response.json({ success: true, recommendations: Object.values(aggregated) });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});