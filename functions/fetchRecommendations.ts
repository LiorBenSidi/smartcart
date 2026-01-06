import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// This function acts as a bridge between your Base44 app and your external Deep Learning Model API
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Gather data to send to the model (User Profile + Recent Receipts)
        // In a real scenario, you might send just the user ID if the model has direct DB access,
        // or send a feature vector constructed here.
        const [profile] = await base44.entities.UserProfile.filter({ created_by: user.email });
        const recentReceipts = await base44.entities.Receipt.filter({ created_by: user.email }, '-purchased_at', 10);
        
        const payload = {
            user_id: user.id,
            email: user.email,
            profile_data: profile || {},
            recent_purchase_history: recentReceipts.map(r => ({
                date: r.date,
                total: r.totalAmount,
                items: r.items // Simplified item list
            }))
        };

        // 2. Call your external Deep Learning Model API
        // You'll need to set the RECOMMENDATION_API_URL secret in the dashboard
        const modelApiUrl = Deno.env.get("RECOMMENDATION_API_URL");
        
        if (!modelApiUrl) {
            console.warn("RECOMMENDATION_API_URL not set. Returning mock recommendations.");
            // Mock response for development/demo purposes
            return Response.json({
                success: true,
                source: "mock_internal",
                recommendations: [
                    {
                        product_id: "mock_1",
                        product_name: "Organic Almond Milk",
                        score: 0.95,
                        reason: "Popular with users who buy Granola",
                        type: "frequently_bought_together"
                    },
                    {
                        product_id: "mock_2",
                        product_name: "Dark Chocolate 70%",
                        score: 0.88,
                        reason: "Based on your taste profile",
                        type: "similar_user"
                    }
                ]
            });
        }

        const modelResponse = await fetch(modelApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'Authorization': `Bearer ${Deno.env.get("RECOMMENDATION_API_KEY")}` // Uncomment if needed
            },
            body: JSON.stringify(payload)
        });

        if (!modelResponse.ok) {
            throw new Error(`Model API failed with status ${modelResponse.status}`);
        }

        const modelData = await modelResponse.json();

        // 3. Store recommendations in Base44 for the UI to consume
        // We delete old recommendations to keep the list fresh
        const oldRecs = await base44.entities.ProductRecommendation.filter({ created_by: user.email });
        // Note: Real implementation might update instead of delete, or keep history.
        // For now, we'll just return the data to the frontend, or you could save it here:
        
        /* 
        // Example saving logic:
        await Promise.all(modelData.recommendations.map(rec => 
            base44.entities.ProductRecommendation.create({
                product_id: rec.product_id,
                product_name: rec.product_name,
                score: rec.score,
                reason: rec.reason,
                recommendation_type: rec.type,
                model_version: modelData.version || 'v1'
            })
        ));
        */

        return Response.json({ 
            success: true, 
            recommendations: modelData.recommendations 
        });

    } catch (error) {
        console.error("Recommendation fetch failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});