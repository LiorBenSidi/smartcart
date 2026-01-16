import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        // Fetch all stores
        const stores = await base44.entities.Store.list('', 1000);
        const results = [];
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        for (let i = 0; i < stores.length; i++) {
            // Stop processing if too many consecutive errors
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error(`Stopping analysis after ${consecutiveErrors} consecutive errors`);
                results.push({ error: `Stopped after ${consecutiveErrors} consecutive errors` });
                break;
            }
            const store = stores[i];
            // Add delay between requests to avoid rate limiting (2000ms between LLM calls)
            if (i > 0) {
                await delay(2000);
            }
            try {
                // Fetch all reviews for this store
                const reviews = await base44.entities.StoreReview.filter({ store_id: store.id }, '', 1000);
                console.log(`Store ${store.id}: Found ${reviews.length} reviews`);

                if (reviews.length === 0) {
                    // No reviews yet, skip this store
                    console.log(`Store ${store.id}: No reviews, skipping`);
                    results.push({ store_id: store.id, action: 'no_reviews' });
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
                    console.log(`Store ${store.id}: No comments, skipping`);
                    results.push({ store_id: store.id, action: 'no_comments' });
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
                    results.push({ store_id: store.id, action: 'llm_failed' });
                    consecutiveErrors++;
                    continue;
                }

                // Calculate majority sentiment
                const likes = sentimentScores.filter(s => s === 1).length;
                const dislikes = sentimentScores.filter(s => s === -1).length;
                const sentimentScore = likes > dislikes ? 1 : (dislikes > likes ? -1 : 0);
                const overallSentiment = sentimentScore > 0 ? 'positive' : (sentimentScore < 0 ? 'negative' : 'neutral');
                
                console.log(`Store ${store.id}: Sentiment - ${likes} likes, ${dislikes} dislikes -> ${overallSentiment}`);

                // Check if sentiment record exists
                const existing = await base44.asServiceRole.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

                const sentimentData = {
                    store_id: store.id,
                    overall_sentiment: overallSentiment,
                    sentiment_score: sentimentScore / reviews.length, // Normalize to -1 to 1 range
                    review_count: reviews.length,
                    average_rating: avgRating,
                    positive_reviews: likes,
                    neutral_reviews: 0,
                    negative_reviews: dislikes,
                    last_analyzed_at: new Date().toISOString()
                };

                try {
                    if (existing.length > 0) {
                        await base44.asServiceRole.entities.StoreSentiment.update(existing[0].id, sentimentData);
                        results.push({ store_id: store.id, action: 'updated' });
                    } else {
                        await base44.asServiceRole.entities.StoreSentiment.create(sentimentData);
                        results.push({ store_id: store.id, action: 'created' });
                    }
                } catch (entityError) {
                    console.error(`Failed to save sentiment for store ${store.id}:`, entityError);
                    throw entityError;
                    }

                    // Reset consecutive error counter on success
                    consecutiveErrors = 0;

                    } catch (storeError) {
                    console.error(`Failed to analyze store ${store.id}:`, storeError);
                    results.push({ store_id: store.id, action: 'failed', error: storeError.message });
                    consecutiveErrors++;
                    }
                    }

        return Response.json({
            success: true,
            message: `Sentiment analysis completed for ${results.length} stores`,
            results
        });

    } catch (error) {
        console.error("Sentiment analysis failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});