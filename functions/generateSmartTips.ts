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
            monthly_budget: userProfile.monthly_budget,
            age_range: userProfile.age_range,
            user_role: userProfile.user_role,
            diet: userProfile.diet,
            kosher_level: userProfile.kosher_level,
            household_size: userProfile.household_size,
            allergies: userProfile.allergies,
            preferred_store_chains: userProfile.preferred_store_chains,
            dietary_restrictions: userProfile.dietary_restrictions,
            allergen_avoid_list: userProfile.allergen_avoid_list,
            kashrut_level: userProfile.kashrut_level,
            health_preferences: userProfile.health_preferences
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

        IMPORTANT: When generating tips similar to liked tips, include an "inspired_by_liked_tips" field (array of strings) in the response with the EXACT FULL TEXT of ALL liked tips that inspired it (copy them verbatim). If inspired by multiple tips, include all of them. This helps users understand why they're seeing this recommendation.

        **CRITICAL GUIDELINES FOR TIP GENERATION (ADHERE STRICTLY):**
        - **Allergy Avoidance:** The user has strict dietary needs. ALL suggested products MUST be free of items in their 'allergen_avoid_list': ${JSON.stringify(userProfile.allergen_avoid_list || [])}. Never suggest items containing these allergens.
        - **Kosher Compliance:** Tips involving food products must rigorously adhere to the user's 'kosher_level': '${userProfile.kosher_level || "none"}'. Only suggest products that meet this kosher standard.
        - **Dietary Restrictions:** Suggestions must align with the user's 'diet': '${userProfile.diet || "none"}' and 'dietary_restrictions': ${JSON.stringify(userProfile.dietary_restrictions || [])}. Do not suggest products that violate these restrictions.
        - **Budget Focus:** Tailor money-saving tips to their 'budget_focus': '${userProfile.budget_focus || "medium"}' and 'monthly_budget': ${userProfile.monthly_budget || "not specified"}. IMPORTANT: Express savings as PERCENTAGES, not absolute amounts (e.g., "save 20%" not "save ₪2"). Percentages are psychologically more attractive.
        - **Health Preferences:** If 'health_preferences' are specified (${JSON.stringify(userProfile.health_preferences || [])}), prioritize tips that align with them.
        - **Household Context:** Consider 'household_size': ${userProfile.household_size || 1} and 'user_role': '${userProfile.user_role || "not specified"}' when suggesting quantities or family-oriented products.
        - **Store Preferences:** If the user prefers specific chains (${JSON.stringify(userProfile.preferred_store_chains || [])}), reference these stores in your tips when relevant.

        **SPECIFICITY REQUIREMENTS:**
        - Use actual product names from recommendations, not generic categories
        - Include specific price comparisons as PERCENTAGES when suggesting alternatives (e.g., "20% cheaper" instead of "₪2 less")
        - Reference real stores from the user's area when applicable
        - Base discovery tips on the user's actual purchase history and habits

        Desired Tip Categories:
        1. Money-saving: Suggest specific cheaper alternatives or brands with PERCENTAGE savings (e.g., "Switch to X brand and save 25%").
        2. Health/Dietary: Highlight specific items fitting their exact dietary profile with compliance confirmation.
        3. Discovery: Recommend specific products that similar users buy, ensuring all preferences are met.

        Format: JSON array of objects with keys:
        - "type": "money_saving" | "health_dietary" | "discovery" | "general"
        - "message": (string, max 2 sentences, must be specific and actionable)
        - "related_entity_name": (string, optional - use actual product/store name when applicable)
        - "inspired_by_liked_tips": (array of strings, optional - if this tip is similar to liked tips, copy the EXACT FULL MESSAGE of ALL those liked tips here verbatim as an array)

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
                                related_entity_name: { type: "string" },
                                inspired_by_liked_tips: { 
                                    type: "array",
                                    items: { type: "string" }
                                }
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