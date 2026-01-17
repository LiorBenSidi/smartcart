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

    const { latitude, longitude, radius, distanceWeight = 0.5, ratingWeight = 0.25, sentimentWeight = 0.25 } = await req.json();

    if (!latitude || !longitude) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    // Fetch all stores, chains, reviews, and sentiment data
    const [stores, chains, allReviews, allSentiments] = await Promise.all([
        base44.entities.Store.list('-created_date', 1000),
        base44.entities.Chain.list('-created_date', 1000),
        base44.entities.StoreReview.list('-created_date', 5000),
        base44.entities.StoreSentiment.list('-created_date', 1000)
    ]);

    const chainMap = new Map(chains.map(c => [c.id, c]));
    
    // Create review and sentiment maps for quick lookup
    const reviewsByStore = new Map();
    allReviews.forEach(review => {
        if (!reviewsByStore.has(review.store_id)) {
            reviewsByStore.set(review.store_id, []);
        }
        reviewsByStore.get(review.store_id).push(review);
    });
    
    const sentimentMap = new Map(allSentiments.map(s => [s.store_id, s]));

    // Filter stores within radius (if provided) and calculate distance
    const nearbyStores = stores
      .filter(store => store.latitude && store.longitude)
      .map(store => {
        // Handle case where chain_id might be an object (expanded relation) or string
        const chainId = typeof store.chain_id === 'object' && store.chain_id !== null 
            ? store.chain_id.id 
            : store.chain_id;
            
        const chain = chainMap.get(chainId);
        
        return { 
            ...store, 
            distance: calculateDistance(latitude, longitude, store.latitude, store.longitude),
            chain_name: chain?.name || 'Unknown Chain',
            chain_logo: chain?.logo_url,
            // Keep original chain_id for consistent reference
            chain_id: chainId
        };
      })
      .filter(store => !radius || store.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // Get user profile for recommendations
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const userProfile = profiles.length > 0 ? profiles[0] : null;

    // Get user's receipt history
    const receipts = await base44.entities.Receipt.filter({ created_by: user.email });

    // Enrich only top 25 closest stores (by Haversine distance) with driving duration
    // This balances accuracy with API rate limits and performance
    const storesToEnrichEarly = nearbyStores.slice(0, 25);

    await Promise.all(storesToEnrichEarly.map(async (store) => {
        try {
            const res = await base44.functions.invoke('getRoute', {
                origin: { lat: latitude, lon: longitude },
                destination: { lat: store.latitude, lon: store.longitude },
                mode: 'driving'
            });

            if (res.data && res.data.duration) {
                store.rawDuration = res.data.duration; // in seconds
                store.usingRouteDuration = true;
            }
        } catch (e) {
            // Silently fail, will use Haversine distance as fallback
            console.error("Routing error for store", store.name, e.message);
        }
    }));

    // Mark stores beyond top 25 as using Haversine distance
    nearbyStores.slice(25).forEach(store => {
        store.usingRouteDuration = false;
    });

    // Calculate weighted recommendation score for each store
    const storesWithScores = nearbyStores.map(store => {
      // 1. Distance score (normalized 0-1, closer = higher)
      // Prioritize driving duration if available, fall back to Haversine distance
      let distanceScore;
      if (store.rawDuration) {
          const maxDuration = Math.max(...nearbyStores.map(s => s.rawDuration || Infinity), 1);
          distanceScore = 1 - (store.rawDuration / maxDuration);
      } else {
          const maxDistance = Math.max(...nearbyStores.map(s => s.distance), 1);
          distanceScore = 1 - (store.distance / maxDistance);
      }
      
      // 2. Rating score (normalized 0-1)
      const storeReviews = reviewsByStore.get(store.id) || [];
      let ratingScore = 0;
      if (storeReviews.length > 0) {
        const avgRating = storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length;
        ratingScore = avgRating / 5; // Normalize to 0-1 (assuming 5-star max)
      }
      
      // 3. Sentiment score (normalized 0-1)
      const sentiment = sentimentMap.get(store.id);
      let sentimentScore = 0.5; // Default neutral
      if (sentiment) {
        // Sentiment can be positive (1), neutral (0.5), or negative (0)
        if (sentiment.overall_sentiment === 'positive') sentimentScore = 1;
        else if (sentiment.overall_sentiment === 'negative') sentimentScore = 0;
      }
      
      // Calculate weighted combined score (0-100 scale)
      const combinedScore = (
        distanceScore * distanceWeight +
        ratingScore * ratingWeight +
        sentimentScore * sentimentWeight
      ) * 100;
      
      // Penalty for stores without reviews (always applied)
      const noReviewPenalty = (storeReviews.length === 0) ? -5 : 0;

      return { 
        ...store, 
        recommendationScore: combinedScore + noReviewPenalty,
        distanceScore,
        ratingScore,
        sentimentScore,
        avgRating: storeReviews.length > 0 
          ? (storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length).toFixed(1)
          : null,
        usingRouteDuration: store.usingRouteDuration !== false // Default to true if set
      };
    });

    // Sort by recommendation score
    storesWithScores.sort((a, b) => b.recommendationScore - a.recommendationScore);

    const recommendedStore = storesWithScores[0];

    // Format driving info for top stores that were already enriched
    storesWithScores.forEach(store => {
        if (store.rawDuration) {
            const minutes = Math.round(store.rawDuration / 60);
            const durationText = minutes > 60 
                ? `${Math.floor(minutes/60)} hr ${minutes%60} min` 
                : `${minutes} min`;

            store.drivingInfo = {
                duration: durationText,
                rawDuration: store.rawDuration,
                rawDistance: store.rawDistance || null
            };
        }
    });

    return Response.json({
      nearbyStores: storesWithScores,
      recommendedStore: storesWithScores[0],
      totalFound: storesWithScores.length
    });

  } catch (error) {
    console.error('Error finding nearby stores:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});