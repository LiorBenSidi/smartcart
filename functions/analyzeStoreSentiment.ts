import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only function
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { storeId } = body;

    if (!storeId) {
      return Response.json({ error: "storeId required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Fetch all reviews for this store
    const reviews = await svc.entities.StoreReview.filter({ store_id: storeId });

    if (reviews.length === 0) {
      // Create default sentiment for store with no reviews
      await svc.entities.StoreSentiment.filter({ store_id: storeId }).then(async (existing) => {
        if (existing.length > 0) {
          await svc.entities.StoreSentiment.delete(existing[0].id);
        }
      });

      const sentiment = await svc.entities.StoreSentiment.create({
        store_id: storeId,
        average_sentiment_score: 0,
        review_count: 0,
        positive_count: 0,
        neutral_count: 0,
        negative_count: 0,
        sentiment_label: "neutral",
        last_updated: new Date().toISOString()
      });

      return Response.json({ success: true, sentiment, message: "No reviews to analyze" });
    }

    // Analyze sentiment for each review using LLM
    const sentimentResults = [];

    for (const review of reviews) {
      const reviewText = review.comment || `Rating: ${review.rating}/5 stars`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the sentiment of this store review. Return only a JSON object with "sentiment" (value: -1 to 1 where -1 is very negative, 0 is neutral, 1 is very positive) and "label" (value: "very_positive", "positive", "neutral", "negative", or "very_negative").\n\nReview: "${reviewText}"\n\nRating: ${review.rating}/5`,
        response_json_schema: {
          type: 'object',
          properties: {
            sentiment: { type: 'number', minimum: -1, maximum: 1 },
            label: { type: 'string', enum: ["very_positive", "positive", "neutral", "negative", "very_negative"] }
          }
        }
      });

      sentimentResults.push({
        reviewId: review.id,
        sentiment: result.sentiment,
        label: result.label
      });
    }

    // Calculate aggregate metrics
    const totalScore = sentimentResults.reduce((sum, r) => sum + r.sentiment, 0);
    const averageSentiment = totalScore / sentimentResults.length;

    const labelCounts = {
      very_positive: sentimentResults.filter(r => r.label === 'very_positive').length,
      positive: sentimentResults.filter(r => r.label === 'positive').length,
      neutral: sentimentResults.filter(r => r.label === 'neutral').length,
      negative: sentimentResults.filter(r => r.label === 'negative').length,
      very_negative: sentimentResults.filter(r => r.label === 'very_negative').length
    };

    const positiveCount = labelCounts.very_positive + labelCounts.positive;
    const negativeCount = labelCounts.negative + labelCounts.very_negative;

    // Determine overall label
    let sentimentLabel = 'neutral';
    if (averageSentiment > 0.5) sentimentLabel = 'very_positive';
    else if (averageSentiment > 0.2) sentimentLabel = 'positive';
    else if (averageSentiment < -0.5) sentimentLabel = 'very_negative';
    else if (averageSentiment < -0.2) sentimentLabel = 'negative';

    // Upsert StoreSentiment
    const existing = await svc.entities.StoreSentiment.filter({ store_id: storeId });
    let sentiment;

    if (existing.length > 0) {
      sentiment = await svc.entities.StoreSentiment.update(existing[0].id, {
        average_sentiment_score: averageSentiment,
        review_count: reviews.length,
        positive_count: positiveCount,
        neutral_count: labelCounts.neutral,
        negative_count: negativeCount,
        sentiment_label: sentimentLabel,
        last_updated: new Date().toISOString()
      });
    } else {
      sentiment = await svc.entities.StoreSentiment.create({
        store_id: storeId,
        average_sentiment_score: averageSentiment,
        review_count: reviews.length,
        positive_count: positiveCount,
        neutral_count: labelCounts.neutral,
        negative_count: negativeCount,
        sentiment_label: sentimentLabel,
        last_updated: new Date().toISOString()
      });
    }

    console.log(`Analyzed ${reviews.length} reviews for store ${storeId}, sentiment: ${averageSentiment.toFixed(3)}`);

    return Response.json({ success: true, sentiment, analyzed: reviews.length });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});