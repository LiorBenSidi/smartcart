import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const collaborativeSuggestions = [];
        
        // 1. Get similar users
        // Try to fetch pre-computed similar users
        const similarUsers = await base44.entities.SimilarUserEdge.filter(
            { user_id: user.email },
            '-similarity',
            5
        ).catch(() => []);

        if (similarUsers.length > 0) {
            const neighborIds = similarUsers.map(su => su.neighbor_user_id);

            // 2. Get top products purchased by similar users
            for (const neighborId of neighborIds) {
                // Get neighbor's habits
                const neighborHabits = await base44.entities.UserProductHabit.filter(
                    { created_by: neighborId },
                    '-confidence_score',
                    10
                ).catch(() => []);

                for (const habit of neighborHabits) {
                    // Check if current user already has a habit for this product to avoid redundancy
                    // (We'll let the merging logic in generateDailySuggestions handle the strict "already known" check, 
                    // but here we can do a quick check if we want, or just return candidates)
                    
                    collaborativeSuggestions.push({
                        product_id: habit.product_id,
                        product_name: habit.product_name,
                        suggested_qty: Math.round(habit.avg_quantity) || 1,
                        reason_type: "Collaborative",
                        confidence: 0.5 * habit.confidence_score, // Baseline confidence for collab
                        evidence: {
                            similar_users_count: similarUsers.length,
                            source_neighbor: neighborId,
                            neighbor_confidence: habit.confidence_score
                        }
                    });
                }
            }
        }

        // Simple dedup by product_id, keeping highest confidence
        const uniqueSuggestions = new Map();
        for (const s of collaborativeSuggestions) {
            if (!uniqueSuggestions.has(s.product_id) || uniqueSuggestions.get(s.product_id).confidence < s.confidence) {
                uniqueSuggestions.set(s.product_id, s);
            }
        }

        return Response.json({ suggestions: Array.from(uniqueSuggestions.values()) });

    } catch (error) {
        console.error("Collaborative recommendations failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});