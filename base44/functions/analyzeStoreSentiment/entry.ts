import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        const payload = await req.json().catch(() => ({}));
        const batch = payload.batch || 0;
        const limit = payload.limit || 5;
        const skip = batch * limit;

        // Fetch stores for this batch
        // Note: SDK list(sort, limit, skip)
        const stores = await base44.entities.Store.list('', limit, skip);
        const chains = await base44.entities.Chain.list('', 1000);
        const chainMap = {};
        chains.forEach(c => chainMap[c.id] = c.name);

        const results = [];
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 1;

        console.log(`Processing batch ${batch}, skip ${skip}, stores found: ${stores.length}`);

        for (let i = 0; i < stores.length; i++) {
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                results.push({ error: `Stopped after ${consecutiveErrors} consecutive errors` });
                break;
            }
            const store = stores[i];
            
            // Add delay
            if (i > 0) await delay(1000);

            try {
                // Fetch reviews
                const reviews = await base44.entities.StoreReview.filter({ store_id: store.id }, '', 1000);

                if (reviews.length === 0) {
                    results.push({ 
                        index: skip + i + 1,
                        store_id: store.id, 
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'no_reviews' 
                    });
                    continue;
                }

                // Calculate mean rating
                const ratings = reviews.map(r => r.rating).filter(Boolean);
                const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

                // Get reviews with comments
                const reviewsWithComments = reviews.filter(r => r.comment && r.comment.trim());
                
                if (reviewsWithComments.length === 0) {
                    results.push({ 
                        index: skip + i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'no_comments' 
                    });
                    continue;
                }

                // Analyze with LLM
                const sentimentScores = [];
                const sentimentDetails = [];
                
                for (const review of reviewsWithComments) {
                    try {
                        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Analyze review for grocery store. Return JSON. Review: "${review.comment}"`,
                            response_json_schema: {
                                type: "object",
                                properties: {
                                    sentiment: { type: "number", enum: [1, -1] },
                                    explanation: { type: "string" },
                                    themes: { type: "array", items: { type: "string" } }
                                },
                                required: ["sentiment", "explanation", "themes"]
                            }
                        });
                        sentimentScores.push(result.sentiment);
                        sentimentDetails.push({
                            sentiment: result.sentiment,
                            explanation: result.explanation,
                            themes: result.themes || []
                        });
                        await delay(500);
                    } catch (llmError) {
                        console.error(`LLM error:`, llmError.message);
                    }
                }

                if (sentimentScores.length === 0) {
                    results.push({ 
                        index: skip + i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'llm_failed' 
                    });
                    consecutiveErrors++;
                    continue;
                }

                // Calculate stats
                const likes = sentimentScores.filter(s => s === 1).length;
                const dislikes = sentimentScores.filter(s => s === -1).length;
                const sentimentScore = likes > dislikes ? 1 : (dislikes > likes ? -1 : 0);
                const overallSentiment = sentimentScore > 0 ? 'positive' : (sentimentScore < 0 ? 'negative' : 'neutral');
                
                // Aggregate themes
                const allThemes = {};
                sentimentDetails.forEach(detail => {
                    detail.themes.forEach(theme => {
                        const t = theme.toLowerCase();
                        allThemes[t] = (allThemes[t] || 0) + 1;
                    });
                });
                const topThemes = Object.entries(allThemes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

                // Update DB
                const sentimentData = {
                    store_id: store.id,
                    overall_sentiment: overallSentiment,
                    sentiment_score: sentimentScore,
                    review_count: reviews.length,
                    average_rating: avgRating,
                    positive_reviews: likes,
                    neutral_reviews: 0,
                    negative_reviews: dislikes,
                    common_themes: topThemes,
                    sentiment_explanations: sentimentDetails.map(d => d.explanation),
                    last_analyzed_at: new Date().toISOString()
                };

                const existing = await base44.asServiceRole.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);
                if (existing.length > 0) {
                    await base44.asServiceRole.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    results.push({ index: skip + i + 1, store_id: store.id, chain_name: chainMap[store.chain_id], action: 'updated' });
                } else {
                    await base44.asServiceRole.entities.StoreSentiment.create(sentimentData);
                    results.push({ index: skip + i + 1, store_id: store.id, chain_name: chainMap[store.chain_id], action: 'created' });
                }
                consecutiveErrors = 0;

            } catch (storeError) {
                console.error(`Store error:`, storeError);
                results.push({ index: skip + i + 1, store_id: store.id, action: 'failed', error: storeError.message });
                consecutiveErrors++;
            }
        }

        // Check if we need to run chain aggregation (end of list)
        let chainResults = [];
        let hasMore = stores.length === limit;

        if (!hasMore) {
            console.log("Running chain aggregation...");
            const allStores = await base44.asServiceRole.entities.Store.list('', 5000);
            const allSentiments = await base44.asServiceRole.entities.StoreSentiment.list('', 5000);
            const sentimentMap = {};
            allSentiments.forEach(s => sentimentMap[s.store_id] = s);

            const chainGroups = {};
            allStores.forEach(s => {
                if (!s.chain_id) return;
                if (!chainGroups[s.chain_id]) chainGroups[s.chain_id] = [];
                chainGroups[s.chain_id].push(s);
            });

            for (const [chainId, chainStores] of Object.entries(chainGroups)) {
                const storesWithSentiment = chainStores.map(s => ({ store: s, sentiment: sentimentMap[s.id] })).filter(x => x.sentiment);
                
                const avgRating = storesWithSentiment.length > 0 
                    ? storesWithSentiment.reduce((sum, x) => sum + (x.sentiment.average_rating || 0), 0) / storesWithSentiment.length
                    : 0;

                const counts = { positive: 0, neutral: 0, negative: 0 };
                storesWithSentiment.forEach(x => {
                    if (x.sentiment.overall_sentiment) counts[x.sentiment.overall_sentiment]++;
                });

                const majority = storesWithSentiment.length === 0 ? 'neutral'
                    : counts.positive >= counts.negative && counts.positive >= counts.neutral ? 'positive'
                    : counts.negative >= counts.neutral ? 'negative' : 'neutral';

                const chainData = {
                    chain_id: chainId,
                    average_rating: Number(avgRating.toFixed(2)),
                    overall_sentiment: majority,
                    positive_stores: counts.positive,
                    neutral_stores: counts.neutral,
                    negative_stores: counts.negative,
                    total_stores_analyzed: storesWithSentiment.length,
                    last_analyzed_at: new Date().toISOString()
                };

                const existing = await base44.asServiceRole.entities.ChainSentiment.filter({ chain_id: chainId }, '', 1);
                if (existing.length > 0) {
                    await base44.asServiceRole.entities.ChainSentiment.update(existing[0].id, chainData);
                    chainResults.push({ chain_id: chainId, chain_name: chainMap[chainId], action: 'updated', ...chainData });
                } else {
                    await base44.asServiceRole.entities.ChainSentiment.create(chainData);
                    chainResults.push({ chain_id: chainId, chain_name: chainMap[chainId], action: 'created', ...chainData });
                }
            }
        }

        return Response.json({
            success: true,
            results: results,
            chainResults: chainResults,
            hasMore: hasMore,
            message: hasMore ? `Processed batch ${batch} (${results.length} results)` : `Completed. Analyzed ${results.length} stores and aggregated chains.`
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});