import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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

        for (const store of stores) {
            try {
                // Fetch all reviews for this store
                const reviews = await base44.entities.StoreReview.filter({ store_id: store.id }, '', 1000);

                if (reviews.length === 0) {
                    // No reviews yet, skip
                    continue;
                }

                // Prepare review texts for analysis
                const reviewTexts = reviews.map(r => r.comment || '').filter(Boolean);
                const ratings = reviews.map(r => r.rating).filter(Boolean);

                if (reviewTexts.length === 0) {
                    // No comments to analyze
                    continue;
                }

                // Use LLM for sentiment analysis
                const analysisPrompt = `Analyze the sentiment of these store reviews and provide a comprehensive summary.

Reviews:
${reviewTexts.map((text, idx) => `${idx + 1}. "${text}"`).join('\n')}

Provide:
1. Overall sentiment (positive/neutral/negative)
2. Sentiment score from -1 (very negative) to 1 (very positive)
3. Count of positive, neutral, and negative reviews
4. Common themes mentioned (both positive and negative)`;

                const analysis = await base44.integrations.Core.InvokeLLM({
                    prompt: analysisPrompt,
                    response_json_schema: {
                        type: 'object',
                        properties: {
                            overall_sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
                            sentiment_score: { type: 'number' },
                            positive_count: { type: 'number' },
                            neutral_count: { type: 'number' },
                            negative_count: { type: 'number' },
                            themes: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        }
                    }
                });

                // Calculate average rating
                const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

                // Check if sentiment record exists
                const existing = await base44.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

                const sentimentData = {
                    store_id: store.id,
                    overall_sentiment: analysis.overall_sentiment,
                    sentiment_score: analysis.sentiment_score,
                    review_count: reviews.length,
                    average_rating: avgRating,
                    positive_reviews: analysis.positive_count,
                    neutral_reviews: analysis.neutral_count,
                    negative_reviews: analysis.negative_count,
                    common_themes: analysis.themes,
                    last_analyzed_at: new Date().toISOString()
                };

                if (existing.length > 0) {
                    // Update existing
                    await base44.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    results.push({ store_id: store.id, action: 'updated' });
                } else {
                    // Create new
                    await base44.entities.StoreSentiment.create(sentimentData);
                    results.push({ store_id: store.id, action: 'created' });
                }

            } catch (storeError) {
                console.error(`Failed to analyze store ${store.id}:`, storeError);
                results.push({ store_id: store.id, action: 'failed', error: storeError.message });
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