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
                    // No reviews yet, assign neutral sentiment
                    console.log(`Store ${store.id}: No reviews, assigning neutral sentiment`);
                    const existing = await base44.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

                    const sentimentData = {
                        store_id: store.id,
                        overall_sentiment: 'neutral',
                        sentiment_score: 0,
                        review_count: 0,
                        average_rating: 0,
                        positive_reviews: 0,
                        neutral_reviews: 0,
                        negative_reviews: 0,
                        common_themes: [],
                        last_analyzed_at: new Date().toISOString()
                    };

                    if (existing.length > 0) {
                        await base44.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    } else {
                        await base44.entities.StoreSentiment.create(sentimentData);
                    }

                    results.push({ store_id: store.id, action: 'no_reviews' });
                    continue;
                }

                // Prepare review texts and ratings for analysis
                const reviewTexts = reviews.map(r => r.comment || '').filter(Boolean);
                const ratings = reviews.map(r => r.rating).filter(Boolean);
                console.log(`Store ${store.id}: ${reviewTexts.length} review texts, ${ratings.length} ratings`);

                // Include reviewer name and date in context for better analysis
                const enrichedReviews = reviews
                    .filter(r => r.comment)
                    .map(r => `By ${r.user_display_name || 'Anonymous'} on ${new Date(r.review_date || r.created_date).toLocaleDateString()}: ${r.comment}`);

                if (reviewTexts.length === 0) {
                    // No comments to analyze, but we have ratings - assign based on average
                    console.log(`Store ${store.id}: No comments, but has ratings`);
                    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                    const existing = await base44.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

                    const sentimentData = {
                        store_id: store.id,
                        overall_sentiment: avgRating >= 4 ? 'positive' : avgRating >= 3 ? 'neutral' : 'negative',
                        sentiment_score: (avgRating - 3) / 2, // Map 1-5 to -1 to 1
                        review_count: reviews.length,
                        average_rating: avgRating,
                        positive_reviews: reviews.filter(r => r.rating >= 4).length,
                        neutral_reviews: reviews.filter(r => r.rating === 3).length,
                        negative_reviews: reviews.filter(r => r.rating <= 2).length,
                        common_themes: [],
                        last_analyzed_at: new Date().toISOString()
                    };

                    if (existing.length > 0) {
                        await base44.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    } else {
                        await base44.entities.StoreSentiment.create(sentimentData);
                    }

                    results.push({ store_id: store.id, action: 'no_comments' });
                    continue;
                }

                // Use LLM for sentiment analysis - fallback to rating-based analysis
                let effectiveAnalysis;

                // Calculate average rating for fallback
                const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

                // Default to rating-based analysis
                effectiveAnalysis = {
                    overall_sentiment: avgRating >= 4 ? 'positive' : avgRating >= 3 ? 'neutral' : 'negative',
                    sentiment_score: (avgRating - 3) / 2,
                    positive_count: reviews.filter(r => r.rating >= 4).length,
                    neutral_count: reviews.filter(r => r.rating === 3).length,
                    negative_count: reviews.filter(r => r.rating <= 2).length,
                    themes: []
                };

                // Calculate average rating
                const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

                // Check if sentiment record exists
                const existing = await base44.entities.StoreSentiment.filter({ store_id: store.id }, '', 1);

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
                    await base44.entities.StoreSentiment.update(existing[0].id, sentimentData);
                    results.push({ store_id: store.id, action: 'updated' });
                } else {
                    // Create new
                    await base44.entities.StoreSentiment.create(sentimentData);
                    results.push({ store_id: store.id, action: 'created' });
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