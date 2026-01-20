import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
        latitude, 
        longitude, 
        radius, 
        distanceWeight = 0.5, 
        ratingWeight = 0.25, 
        sentimentWeight = 0.25,
        batch = 0,
        batchSize = 20
    } = await req.json().catch(() => ({}));

    if (!latitude || !longitude) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    const skip = batch * batchSize;

    // Fetch batch of stores and all chains (chains are few)
    const [stores, chains] = await Promise.all([
        base44.entities.Store.list('-created_date', batchSize, skip),
        base44.entities.Chain.list('-created_date', 1000)
    ]);

    const chainMap = new Map(chains.map(c => [c.id, c]));
    const storeIds = stores.map(s => s.id);
    
    // Fetch reviews and sentiments ONLY for the current batch of stores
    // Using filter with $in operator
    let reviews = [];
    let sentiments = [];
    
    if (storeIds.length > 0) {
        [reviews, sentiments] = await Promise.all([
            base44.entities.StoreReview.filter({ store_id: { $in: storeIds } }),
            base44.entities.StoreSentiment.filter({ store_id: { $in: storeIds } })
        ]);
    }
    
    const reviewsByStore = new Map();
    reviews.forEach(review => {
        if (!reviewsByStore.has(review.store_id)) {
            reviewsByStore.set(review.store_id, []);
        }
        reviewsByStore.get(review.store_id).push(review);
    });
    
    const sentimentMap = new Map(sentiments.map(s => [s.store_id, s]));

    // Process the batch
    const processedStores = stores
      .filter(store => store.latitude && store.longitude)
      .map(store => {
        const chainId = typeof store.chain_id === 'object' && store.chain_id !== null 
            ? store.chain_id.id 
            : store.chain_id;
            
        const chain = chainMap.get(chainId);
        const distance = calculateDistance(latitude, longitude, store.latitude, store.longitude);
        
        return { 
            ...store, 
            distance,
            chain_name: chain?.name || 'Unknown Chain',
            chain_logo: chain?.logo_url,
            chain_id: chainId
        };
      })
      .filter(store => !radius || store.distance <= radius);

    // Calculate scores for the batch
    // Note: Normalization is local to the batch or uses fixed assumptions because we don't have global max/min yet.
    // For proper global normalization, frontend should re-normalize after fetching all batches.
    // Here we calculate raw components.
    
    const storesWithScores = processedStores.map(store => {
       // 1. Distance score (cannot fully normalize here without global max, sending raw distance)
       // Frontend will handle final scoring.
       
       // 2. Rating score (normalized 0-1)
       const storeReviews = reviewsByStore.get(store.id) || [];
       let ratingScore = 0;
       if (storeReviews.length > 0) {
         const avgRating = storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length;
         ratingScore = avgRating / 5;
       }
       
       // 3. Sentiment score (normalized 0-1)
       const sentiment = sentimentMap.get(store.id);
       let sentimentScore = 0.5; // Default neutral
       if (sentiment) {
         if (sentiment.overall_sentiment === 'positive') sentimentScore = 1;
         else if (sentiment.overall_sentiment === 'negative') sentimentScore = 0;
       }
       
       // We'll attach these raw scores for the frontend to use
       return { 
         ...store, 
         // Temporary local score, frontend should recalculate
         recommendationScore: 0, 
         raw_distance: store.distance,
         ratingScore,
         sentimentScore,
         avgRating: storeReviews.length > 0 
           ? (storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length).toFixed(1)
           : null,
         review_count: storeReviews.length,
         average_rating: storeReviews.length > 0 
           ? (storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length)
           : 0,
         sentiment: sentiment ? sentiment.overall_sentiment : null,
         usingRouteDuration: false // Default
       };
    });

    return Response.json({
      nearbyStores: storesWithScores,
      batch,
      hasMore: stores.length === batchSize
    });

  } catch (error) {
    console.error('Error finding nearby stores:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});