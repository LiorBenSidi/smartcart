import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const { userId, lookbackDays = 90 } = payload;

        if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

        // Idempotency Check (Simple: Don't run if run today)
        // We'll check if any insight created today exists.
        const today = new Date().toISOString().split('T')[0];
        const recentInsights = await base44.entities.Insight.filter({ 
            user_id: userId,
            created_at: { $gte: today } // Assuming created_at is searchable like this
        });
        
        if (recentInsights.length > 0 && !payload.force) {
             return Response.json({ message: "Insights already generated today", skipped: true });
        }

        // 1. Fetch Data
        // User Profile
        const profiles = await base44.entities.UserProfile.filter({ created_by: userId });
        const profile = profiles[0] || {};
        
        // Receipts
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - lookbackDays);
        const receipts = await base44.entities.Receipt.filter({ 
            created_by: userId,
            purchased_at: { $gte: dateLimit.toISOString() }
        });

        const insights = [];

        // 2. Generate Insights
        
        // A. Top Spend Drivers
        // Aggregate items by total spend
        const productSpend = {};
        receipts.forEach(r => {
            if (r.items) {
                r.items.forEach(i => {
                    if (i.name) {
                        productSpend[i.name] = (productSpend[i.name] || 0) + (i.total || 0);
                    }
                });
            }
        });
        
        const sortedSpend = Object.entries(productSpend).sort(([,a], [,b]) => b - a).slice(0, 3);
        if (sortedSpend.length > 0) {
            insights.push({
                user_id: userId,
                type: "TopSpendDriver",
                title: "Top Spend Drivers",
                message: `Your top spending items recently are: ${sortedSpend.map(s => s[0]).join(', ')}.`,
                metrics_json: { items: sortedSpend },
                status: 'active'
            });
        }

        // B. Shopping Frequency
        if (receipts.length > 2) {
            // Sort by date
            const dates = receipts.map(r => new Date(r.purchased_at).getTime()).sort((a,b) => a - b);
            let totalDiff = 0;
            for (let i = 1; i < dates.length; i++) {
                totalDiff += (dates[i] - dates[i-1]);
            }
            const avgDiffDays = (totalDiff / (dates.length - 1)) / (1000 * 3600 * 24);
            
            insights.push({
                user_id: userId,
                type: "ShoppingFrequency",
                title: "Shopping Cadence",
                message: `You typically shop every ${Math.round(avgDiffDays)} days.`,
                metrics_json: { avg_days: avgDiffDays },
                status: 'active'
            });
        }

        // C. Shopper Twins
        // Fetch similar users info
        const indexes = await base44.entities.SimilarUserIndex.filter({ user_id: userId });
        if (indexes.length > 0 && indexes[0].similar_user_ids.length > 0) {
             insights.push({
                user_id: userId,
                type: "ShopperTwins",
                title: "Shopper Twin Insight",
                message: "Users like you often save by switching to private label brands for pasta and rice.",
                metrics_json: { twin_count: indexes[0].similar_user_ids.length },
                status: 'active'
            });
        }

        // Store Insights
        await Promise.all(insights.map(i => base44.entities.Insight.create(i)));

        return Response.json({ success: true, count: insights.length });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});