import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { recommendations } = await req.json();

        // 1. Fetch User Profile
        const profiles = await base44.entities.UserProfile.filter({ created_by: user.email }, '-updated_at', 1);
        const userProfile = profiles[0] || {};

        // 2. Fetch User Habits (for "Discovery" context)
        const habits = await base44.entities.UserProductHabit.filter({ created_by: user.email }, '-confidence_score', 5);

        // 2.5 Fetch Feedback
        const feedback = await base44.entities.SmartTipFeedback.filter({ created_by: user.email }, '-created_at', 50);
        const likedTips = feedback.filter(f => f.action === 'like').map(f => f.full_message);
        const dislikedTips = feedback.filter(f => f.action === 'dislike').map(f => f.full_message);

        // 3. Prepare Prompt Context
        const profileContext = {
            budget_focus: userProfile.budget_focus,
            diet: userProfile.diet,
            kosher_level: userProfile.kosher_level,
            allergies: userProfile.allergies,
            household_size: userProfile.household_size,
            preferred_store_chains: userProfile.preferred_store_chains
        };

        // Simplify recommendations for prompt (avoid token limit)
        const simplifiedRecs = {
            products: (recommendations.products || []).slice(0, 10).map(p => ({
                name: p.name,
                price: p.current_price,
                brand: p.brand_name,
                tags: p.dietary_tags
            })),
            stores: (recommendations.chains || []).slice(0, 3).map(s => ({
                name: s.name,
                description: s.description
            }))
        };

        const habitsContext = habits.map(h => h.product_name);

        const prompt = `
You are SmartShopper, an intelligent shopping assistant.
Generate 3-5 unique, concise, and personalized shopping tips based on the user's profile and recommendations.

User Profile: ${JSON.stringify(profileContext)}
Top Habits: ${JSON.stringify(habitsContext)}
Current Recommendations: ${JSON.stringify(simplifiedRecs)}

User Feedback History (Learn from this):
- Liked Tips (Do more of this): ${JSON.stringify(likedTips)}
- Disliked Tips (Avoid this style/content): ${JSON.stringify(dislikedTips)}

Desired Tip Categories:
1. Money-saving: Suggest cheaper alternatives or brands based on budget focus.
2. Health/Dietary: Highlight items fitting their diet (e.g., vegan, kosher).
3. Discovery: "Users like you also buy..." based on habits/recommendations.

Format: JSON array of objects with keys:
- "type": "money_saving" | "health_dietary" | "discovery" | "general"
- "message": (string, max 2 sentences)
- "related_entity_name": (string, optional)

Output ONLY the JSON array.
`;

        // 4. Call LLM
        const completion = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    tips: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                type: { type: "string" },
                                message: { type: "string" },
                                related_entity_name: { type: "string" }
                            }
                        }
                    }
                }
            }
        });

        return Response.json({ tips: completion.tips || [] });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});