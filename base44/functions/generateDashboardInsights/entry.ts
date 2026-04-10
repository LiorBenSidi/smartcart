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

        // If no receipts, use collaborative filtering based on onboarding profile
        if (receipts.length === 0) {
            if (!userProfile) {
                return Response.json({ 
                    insights: [],
                    message: "Complete onboarding to get personalized insights!"
                });
            }

            // Fetch similar users based on profile
            const similarUsers = await base44.entities.SimilarUserEdge.filter({ user_id: user.email }, '-similarity', 10).catch(() => []);
            
            // Get insights from similar users' habits
            let collaborativeInsights = [];
            if (similarUsers.length > 0) {
                const neighborIds = similarUsers.map(s => s.neighbor_user_id);
                // Fetch habits from similar users
                const neighborHabits = await base44.entities.UserProductHabit.filter({}, '-purchase_count', 100).catch(() => []);
                const relevantHabits = neighborHabits.filter(h => neighborIds.includes(h.user_id));
                
                // Aggregate popular products among similar users
                const productPopularity = {};
                relevantHabits.forEach(h => {
                    if (!productPopularity[h.product_name]) {
                        productPopularity[h.product_name] = { count: 0, avgCadence: 0, users: 0 };
                    }
                    productPopularity[h.product_name].count += h.purchase_count || 1;
                    productPopularity[h.product_name].avgCadence += h.avg_cadence_days || 7;
                    productPopularity[h.product_name].users += 1;
                });

                collaborativeInsights = Object.entries(productPopularity)
                    .map(([name, data]) => ({ name, ...data, avgCadence: data.avgCadence / data.users }))
                    .sort((a, b) => b.users - a.users)
                    .slice(0, 10);
            }

            // Generate profile-based recommendations using LLM
            const profilePrompt = `You are an expert shopping advisor. Generate personalized recommendations for a NEW user who just completed onboarding.

USER PROFILE (from onboarding):
- Budget Focus: ${userProfile.budget_focus || 'balanced'}
- Monthly Budget Target: ${userProfile.monthly_budget ? '₪' + userProfile.monthly_budget : 'Not set'}
- Household Size: ${userProfile.household_size || 1}
- Dietary Restrictions: ${JSON.stringify(userProfile.dietary_restrictions || [])}
- Allergies: ${JSON.stringify(userProfile.allergen_avoid_list || [])}
- Kosher Level: ${userProfile.kosher_level || userProfile.kashrut_level || 'none'}
- Age Range: ${userProfile.age_range || 'Unknown'}
- User Role: ${userProfile.user_role || 'Unknown'}

${collaborativeInsights.length > 0 ? `
COLLABORATIVE FILTERING DATA (from ${similarUsers.length} similar users):
Popular products among users with similar profiles:
${collaborativeInsights.map(p => `- ${p.name}: bought by ${p.users} similar users, avg purchase every ${p.avgCadence.toFixed(0)} days`).join('\n')}
` : ''}

TASK: Generate 3-4 actionable shopping recommendations based on:
1. The user's stated preferences and constraints
2. Patterns from similar users (collaborative filtering)
3. General best practices for their household type

Each recommendation should:
- Be specific and actionable
- Include an estimated monthly savings (realistic, between ₪20-₪150 per tip)
- Respect dietary restrictions and allergies
- Feel personalized, not generic`;

            const aiResponse = await base44.integrations.Core.InvokeLLM({
                prompt: profilePrompt,
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
                        topRecommendations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    potentialSavings: { type: "number" },
                                    rationale: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

            return Response.json({
                rawData: {
                    topCategories: [],
                    frequentItems: [],
                    spendingTrend: "0",
                    last30DaysTotal: "0",
                    avgReceiptValue: "0",
                    totalReceipts: 0,
                    isNewUser: true,
                    similarUsersCount: similarUsers.length
                },
                aiInsights: aiResponse,
                success: true
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

        // Calculate average monthly spending
        const monthsOfData = Math.max(1, Math.ceil((now - new Date(receipts[receipts.length - 1]?.purchased_at || receipts[receipts.length - 1]?.date || now)) / (1000 * 60 * 60 * 24 * 30)));
        const averageMonthlySpending = totalSpent / monthsOfData;

        // Identify high-price items (items bought above category average)
        const categoryAvgPrices = {};
        Object.entries(categoryTotals).forEach(([cat, total]) => {
            const itemsInCat = Object.values(productFrequency).filter(p => p.category === cat);
            const totalCount = itemsInCat.reduce((sum, p) => sum + p.count, 0);
            categoryAvgPrices[cat] = totalCount > 0 ? total / totalCount : 0;
        });

        const highPriceItems = Object.entries(productFrequency)
            .filter(([name, data]) => {
                const avgPrice = data.total / data.count;
                const catAvg = categoryAvgPrices[data.category] || 0;
                return avgPrice > catAvg * 1.3 && data.count >= 2;
            })
            .slice(0, 5)
            .map(([name, data]) => ({ name, avgPrice: (data.total / data.count).toFixed(2), category: data.category }));

        // Identify potential brand switching opportunities
        const brandSwitchPotential = topCategories.slice(0, 3).map(cat => cat.name).join(', ');

        // Identify overspending areas
        const overspendingAreas = topCategories.slice(0, 2).map(cat => `${cat.name} (₪${cat.amount.toFixed(0)})`).join(', ');

        // Prepare context for AI
        const contextData = {
            totalReceipts: receipts.length,
            totalSpent: totalSpent.toFixed(2),
            avgReceiptValue: avgReceiptValue.toFixed(2),
            averageMonthlySpending: averageMonthlySpending.toFixed(2),
            topCategories,
            frequentItems,
            highPriceItems,
            last30DaysSpending: last30DaysTotal.toFixed(2),
            spendingTrend: spendingTrend.toFixed(1),
            userProfile: userProfile ? {
                budgetFocus: userProfile.budget_focus,
                monthlyBudget: userProfile.monthly_budget,
                diet: userProfile.diet,
                householdSize: userProfile.household_size,
                allergies: userProfile.allergen_avoid_list || [],
                dietaryRestrictions: userProfile.dietary_restrictions || [],
                kosherLevel: userProfile.kosher_level || userProfile.kashrut_level || 'none'
            } : null
        };

        // Generate AI insights with upgraded prompt
        const prompt = `You are an expert financial advisor specializing in grocery spending optimization for busy households.
Your goal is to analyze the user's real shopping behavior and generate highly personalized, realistic, and actionable optimization opportunities that help the user save money with minimal friction.

You must prioritize recommendations that feel achievable, trustworthy, and clearly relevant to THIS user.

IMPORTANT: All monetary values are in Israeli Shekels (ILS/NIS). Always use the ₪ symbol when displaying currency amounts.

────────────────────────────────────
USER CONTEXT
────────────────────────────────────

User Profile:
- User ID: ${user.email}
- Average Monthly Grocery Spending: ₪${averageMonthlySpending.toFixed(2)}
- Household Size: ${userProfile?.household_size || 'Unknown'}
- Budget Focus: ${userProfile?.budget_focus || 'balanced'}
- Dietary Restrictions: ${JSON.stringify(userProfile?.dietary_restrictions || [])}
- Allergies: ${JSON.stringify(userProfile?.allergen_avoid_list || [])}
- Kosher Level: ${userProfile?.kosher_level || userProfile?.kashrut_level || 'none'}
- Monthly Budget Target: ${userProfile?.monthly_budget ? '₪' + userProfile.monthly_budget : 'Not set'}

User's Recent Spending Habits (derived from ${receipts.length} receipts):
- Total Spent (all time): ₪${totalSpent.toFixed(2)}
- Average Receipt Value: ₪${avgReceiptValue.toFixed(2)}
- Last 30 Days Spending: ₪${last30DaysTotal.toFixed(2)}
- Spending Trend: ${spendingTrend > 0 ? '+' : ''}${spendingTrend.toFixed(1)}% vs previous period
- Top Categories by Spend: ${JSON.stringify(topCategories)}
- Frequently Purchased Items: ${JSON.stringify(frequentItems.slice(0, 5))}
- Items Often Bought at High Prices: ${JSON.stringify(highPriceItems)}
- Potential Brand Switching Categories: ${brandSwitchPotential}
- Areas of Potential Overspending: ${overspendingAreas}

────────────────────────────────────
TASK: GENERATE OPTIMIZATION OPPORTUNITIES
────────────────────────────────────

Generate 3–5 DISTINCT, concrete, and actionable optimization opportunities.

Each opportunity must:
1. Be a clear, specific action the user can realistically take.
2. Be tailored to the user's habits, preferences, and constraints.
3. Target a DIFFERENT root cause of overspending (no duplicates or reworded ideas).
4. Respect dietary restrictions, allergies, and kosher level at all times.
5. Reference specific products, categories, or amounts from the user's actual data.

────────────────────────────────────
SAVINGS ESTIMATION RULES
────────────────────────────────────

For EACH opportunity:
- Estimate potential monthly savings in:
  • Absolute value (₪)
  • Percentage of the user's average monthly grocery spend (₪${averageMonthlySpending.toFixed(2)})
- Savings must be conservative, realistic, and clearly justified.
- Total combined savings MUST NOT exceed 35% of the user's average monthly grocery spending (max ₪${(averageMonthlySpending * 0.35).toFixed(0)}).
- Avoid exaggerated or "too good to be true" estimates.

────────────────────────────────────
CLASSIFICATION & PRIORITIZATION
────────────────────────────────────

- At least 2 opportunities must be "Quick Wins": Easy to adopt, minimal lifestyle change, immediate value.
- Remaining opportunities may be "Strategic Changes": Higher impact, require some habit adjustment.

────────────────────────────────────
QUALITY CHECK (MANDATORY)
────────────────────────────────────

Before returning the response, verify that:
- Recommendations feel personalized, not generic.
- Savings estimates are believable and proportional to the user's spending.
- No two recommendations solve the same problem.
- Advice aligns with the user's lifestyle and constraints.`;

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
                                potentialSavings: { type: "number" },
                                potentialSavingsPercentage: { type: "string" },
                                rationale: { type: "string" }
                            }
                        }
                    },
                    total_potential_monthly_savings_nis: { type: "number" },
                    total_potential_monthly_savings_percentage: { type: "string" }
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