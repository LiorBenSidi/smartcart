import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch user's receipts and profile
        const receipts = await base44.entities.Receipt.filter({ created_by: user.email }, '-purchased_at', 200);
        const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
        const userProfile = profiles.length > 0 ? profiles[0] : null;

        if (receipts.length === 0) {
            return Response.json({ 
                insights: [],
                message: "No purchase data available yet. Upload some receipts to get started!"
            });
        }

        // Aggregate data for AI analysis
        const totalSpent = receipts.reduce((sum, r) => sum + (r.total_amount || 0), 0);
        const avgReceiptValue = totalSpent / receipts.length;
        
        // Category analysis
        const categoryTotals = {};
        const productFrequency = {};
        
        receipts.forEach(receipt => {
            if (receipt.items) {
                receipt.items.forEach(item => {
                    const cat = item.category || 'Other';
                    const itemTotal = item.total || item.price || 0;
                    categoryTotals[cat] = (categoryTotals[cat] || 0) + itemTotal;
                    
                    const productKey = item.name || 'Unknown';
                    if (!productFrequency[productKey]) {
                        productFrequency[productKey] = { count: 0, total: 0, category: cat };
                    }
                    productFrequency[productKey].count += (item.quantity || 1);
                    productFrequency[productKey].total += itemTotal;
                });
            }
        });

        const topCategories = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, amount]) => ({ name, amount }));

        const frequentItems = Object.entries(productFrequency)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([name, data]) => ({ name, count: data.count, total: data.total, category: data.category }));

        // Time-based analysis
        const now = new Date();
        const last30Days = receipts.filter(r => {
            const date = new Date(r.purchased_at || r.date);
            return (now - date) / (1000 * 60 * 60 * 24) <= 30;
        });

        const last60To30Days = receipts.filter(r => {
            const date = new Date(r.purchased_at || r.date);
            const daysAgo = (now - date) / (1000 * 60 * 60 * 24);
            return daysAgo > 30 && daysAgo <= 60;
        });

        const last30DaysTotal = last30Days.reduce((sum, r) => sum + (r.total_amount || 0), 0);
        const prev30DaysTotal = last60To30Days.reduce((sum, r) => sum + (r.total_amount || 0), 0);
        const spendingTrend = prev30DaysTotal > 0 ? ((last30DaysTotal - prev30DaysTotal) / prev30DaysTotal) * 100 : 0;

        // Prepare context for AI
        const contextData = {
            totalReceipts: receipts.length,
            totalSpent: totalSpent.toFixed(2),
            avgReceiptValue: avgReceiptValue.toFixed(2),
            topCategories,
            frequentItems,
            last30DaysSpending: last30DaysTotal.toFixed(2),
            spendingTrend: spendingTrend.toFixed(1),
            userProfile: userProfile ? {
                budgetFocus: userProfile.budget_focus,
                monthlyBudget: userProfile.monthly_budget,
                diet: userProfile.diet,
                householdSize: userProfile.household_size
            } : null
        };

        // Generate AI insights
        const prompt = `You are a personal finance and grocery shopping advisor. Analyze this user's shopping data and provide actionable insights.

USER DATA:
${JSON.stringify(contextData, null, 2)}

Generate insights focusing on:
1. Spending patterns and trends
2. Budget optimization opportunities
3. Category-specific recommendations
4. Frequently purchased items analysis
5. Behavioral patterns and anomalies

Be specific, actionable, and data-driven. Reference actual numbers from the data.`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    spendingInsight: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            message: { type: "string" },
                            severity: { type: "string", enum: ["positive", "neutral", "warning"] }
                        }
                    },
                    budgetInsight: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            message: { type: "string" },
                            severity: { type: "string", enum: ["positive", "neutral", "warning"] }
                        }
                    },
                    categoryInsight: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            message: { type: "string" },
                            category: { type: "string" }
                        }
                    },
                    behaviorInsight: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            message: { type: "string" },
                            actionable: { type: "string" }
                        }
                    },
                    topRecommendations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                title: { type: "string" },
                                description: { type: "string" },
                                potentialSavings: { type: "number" }
                            }
                        }
                    }
                }
            }
        });

        return Response.json({
            rawData: {
                topCategories,
                frequentItems,
                spendingTrend: spendingTrend.toFixed(1),
                last30DaysTotal: last30DaysTotal.toFixed(2),
                avgReceiptValue: avgReceiptValue.toFixed(2),
                totalReceipts: receipts.length
            },
            aiInsights: aiResponse,
            success: true
        });

    } catch (error) {
        console.error("Error generating dashboard insights:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});