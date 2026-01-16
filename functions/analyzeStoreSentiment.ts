import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        // Fetch all stores and chains
        const stores = await base44.entities.Store.list('', 1000);
        const chains = await base44.entities.Chain.list('', 1000);
        const chainMap = {};
        chains.forEach(c => chainMap[c.id] = c.name);

        const results = [];
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 1;

        for (let i = 0; i < stores.length; i++) {
            // Stop processing if too many consecutive errors
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error(`Stopping analysis after ${consecutiveErrors} consecutive errors`);
                results.push({ error: `Stopped after ${consecutiveErrors} consecutive errors` });
                break;
            }
            const store = stores[i];
            // Add delay between requests to avoid rate limiting (1000ms between LLM calls)
            if (i > 0) {
                await delay(1000);
            }
            try {
                // Fetch all reviews for this store
                const reviews = await base44.entities.StoreReview.filter({ store_id: store.id }, '', 1000);
                // console.log(`Store ${store.id}: Found ${reviews.length} reviews`);

                if (reviews.length === 0) {
                    // No reviews yet, skip this store
                    // console.log(`Store ${store.id}: No reviews, skipping`);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id, 
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'no_reviews' 
                    });
                    consecutiveErrors = 0; // Reset error counter
                    continue;
                }

                // Calculate mean rating
                const ratings = reviews.map(r => r.rating).filter(Boolean);
                const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
                console.log(`Store ${store.id}: ${reviews.length} reviews, avg rating: ${avgRating.toFixed(2)}`);

                // Get reviews with comments for sentiment analysis
                const reviewsWithComments = reviews.filter(r => r.comment && r.comment.trim());
                
                if (reviewsWithComments.length === 0) {
                    // No comments to analyze, skip
                    // console.log(`Store ${store.id}: No comments, skipping`);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'no_comments' 
                    });
                    consecutiveErrors = 0;
                    continue;
                }

                // Analyze each review with LLM (like=1, dislike=-1)
                console.log(`Store ${store.id}: Analyzing ${reviewsWithComments.length} reviews with LLM`);
                const sentimentScores = [];
                
                for (const review of reviewsWithComments) {
                    try {
                        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Analyze this store review and determine if it's a "like" or "dislike". Review: "${review.comment}". Return only 1 for like or -1 for dislike.`,
                            response_json_schema: {
                                type: "object",
                                properties: {
                                    sentiment: { type: "number", enum: [1, -1] }
                                }
                            }
                        });
                        sentimentScores.push(result.sentiment);
                        await delay(500); // Small delay between LLM calls
                    } catch (llmError) {
                        console.error(`LLM error for review:`, llmError.message);
                        // Continue with other reviews
                    }
                }

                if (sentimentScores.length === 0) {
                    console.log(`Store ${store.id}: LLM analysis failed for all reviews, skipping`);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'llm_failed' 
                    });
                    consecutiveErrors++;
                    continue;
                }

                // Calculate majority sentiment
                const likes = sentimentScores.filter(s => s === 1).length;
                const dislikes = sentimentScores.filter(s => s === -1).length;
                const sentimentScore = likes > dislikes ? 1 : (dislikes > likes ? -1 : 0);
                const overallSentiment = sentimentScore > 0 ? 'positive' : (sentimentScore < 0 ? 'negative' : 'neutral');
                
                console.log(`Store ${store.id}: Sentiment - ${likes} likes, ${dislikes} dislikes -> ${overallSentiment}`);

                const effectiveAnalysis = {
                    overall_sentiment: overallSentiment,
                    sentiment_score: sentimentScore,
                    positive_count: likes,
                    neutral_count: 0,
                    negative_count: dislikes,
                    themes: []
                };

                // Check if sentiment record exists
                const existing = await base44.asServiceRole.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

                const sentimentData = {
                    store_id: store.id,
                    overall_sentiment: effectiveAnalysis.overall_sentiment,
                    sentiment_score: effectiveAnalysis.sentiment_score,
                    review_count: reviews.length,
                    average_rating: avgRating,
                    positive_reviews: effectiveAnalysis.positive_count,
                    neutral_reviews: effectiveAnalysis.neutral_count,
                    negative_reviews: effectiveAnalysis.negative_count,
                    common_themes: effectiveAnalysis.themes || [],
                    last_analyzed_at: new Date().toISOString()
                };

                if (existing.length > 0) {
                    // Update existing
                    await base44.asServiceRole.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'updated' 
                    });
                } else {
                    // Create new
                    await base44.asServiceRole.entities.StoreSentiment.create(sentimentData);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'created' 
                    });
                    }

                    // Reset consecutive error counter on success
                    consecutiveErrors = 0;

                    } catch (storeError) {
                    console.error(`Failed to analyze store ${store.id}:`, storeError);
                    results.push({ 
                        index: i + 1,
                        store_id: store.id,
                        chain_name: chainMap[store.chain_id] || 'Unknown',
                        external_store_code: store.external_store_code,
                        action: 'failed', 
                        error: storeError.message 
                    });
                    consecutiveErrors++;
                    }
                    }

                    // Calculate chain-level aggregations
        console.log("Calculating chain-level sentiment...");
        const chainResults = [];

        // Get all stores with their chains
        const storesWithChains = await base44.asServiceRole.entities.Store.list('', 5000);

        // Get all store sentiments
        const storeSentiments = await base44.asServiceRole.entities.StoreSentiment.list('', 5000);
        const sentimentMap = {};
        storeSentiments.forEach(s => {
            sentimentMap[s.store_id] = s;
        });

        // Group stores by chain
        const chainGroups = {};
        storesWithChains.forEach(store => {
            if (!store.chain_id) return;
            if (!chainGroups[store.chain_id]) {
                chainGroups[store.chain_id] = [];
            }
            chainGroups[store.chain_id].push(store);
        });

        // Calculate for each chain
        for (const [chainId, chainStores] of Object.entries(chainGroups)) {
            const storesWithSentiment = chainStores
                .map(s => ({ store: s, sentiment: sentimentMap[s.id] }))
                .filter(x => x.sentiment);

            if (storesWithSentiment.length === 0) continue;

            // Mean rating
            const avgRating = storesWithSentiment.reduce((sum, x) => sum + (x.sentiment.average_rating || 0), 0) / storesWithSentiment.length;

            // Majority sentiment
            const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
            storesWithSentiment.forEach(x => {
                const s = x.sentiment.overall_sentiment;
                if (s) sentimentCounts[s]++;
            });

            const majoritysentiment = sentimentCounts.positive >= sentimentCounts.negative && sentimentCounts.positive >= sentimentCounts.neutral ? 'positive'
                : sentimentCounts.negative >= sentimentCounts.neutral ? 'negative' : 'neutral';

            const chainData = {
                chain_id: chainId,
                average_rating: Number(avgRating.toFixed(2)),
                overall_sentiment: majoritysentiment,
                positive_stores: sentimentCounts.positive,
                neutral_stores: sentimentCounts.neutral,
                negative_stores: sentimentCounts.negative,
                total_stores_analyzed: storesWithSentiment.length,
                last_analyzed_at: new Date().toISOString()
            };

            // Check if exists
            const existing = await base44.asServiceRole.entities.ChainSentiment.filter({ chain_id: chainId }, '', 1);
            if (existing.length > 0) {
                await base44.asServiceRole.entities.ChainSentiment.update(existing[0].id, chainData);
                chainResults.push({ chain_id: chainId, action: 'updated' });
            } else {
                await base44.asServiceRole.entities.ChainSentiment.create(chainData);
                chainResults.push({ chain_id: chainId, action: 'created' });
            }
            }

            console.log("✅ Sentiment analysis completed:", {
            total_stores: results.length,
            total_chains: chainResults.length
            });

            return Response.json({
            success: true,
            message: `Sentiment analysis completed for ${results.length} stores and ${chainResults.length} chains`,
            results,
            chainResults
        });

    } catch (error) {
        console.error("Sentiment analysis failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});