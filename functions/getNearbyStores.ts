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

    const { latitude, longitude, radius, distanceWeight = 0.5, ratingWeight = 0.25, sentimentWeight = 0.25, batch = 0 } = await req.json();

    if (!latitude || !longitude) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    const BATCH_SIZE = 5; // Process 5 stores at a time
    const ROUTING_LIMIT = 15; // Only route the top 15 closest stores

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
    const allNearbyStores = stores
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

    const totalFound = allNearbyStores.length;
    
    // Pagination Logic
    const startIdx = batch * BATCH_SIZE;
    const endIdx = startIdx + BATCH_SIZE;
    const currentBatchStores = allNearbyStores.slice(startIdx, endIdx);

    // Enrich with routing info ONLY if within limit
    // We process stores in the current batch that are within the top ROUTING_LIMIT
    
    // Fetch routes sequentially with 1000ms delay between requests
    for (let i = 0; i < currentBatchStores.length; i++) {
        const store = currentBatchStores[i];
        const globalIndex = startIdx + i;

        if (globalIndex < ROUTING_LIMIT) {
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
                console.error("Routing error for store", store.name, e.message);
            }

            // Delay 1000ms before next request (if we actually did a request)
            if (i < currentBatchStores.length - 1 && (globalIndex + 1) < ROUTING_LIMIT) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
             store.usingRouteDuration = false;
        }
    }

    // Calculate weighted recommendation score for each store in the batch
    const storesWithScores = currentBatchStores.map(store => {
      // 1. Distance score (normalized 0-1, closer = higher)
      // Prioritize driving duration if available, fall back to Haversine distance
      let distanceScore;
      if (store.rawDuration) {
          const maxDuration = Math.max(...allNearbyStores.map(s => s.rawDuration || Infinity), 1);
          distanceScore = 1 - (store.rawDuration / maxDuration);
      } else {
          const maxDistance = Math.max(...allNearbyStores.map(s => s.distance), 1);
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
        review_count: storeReviews.length,
        average_rating: storeReviews.length > 0 
          ? (storeReviews.reduce((sum, r) => sum + r.rating, 0) / storeReviews.length)
          : 0,
        sentiment: sentiment ? sentiment.overall_sentiment : null,
        usingRouteDuration: store.usingRouteDuration !== false // Default to true if set
      };
    });

    // Format driving info
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
      totalFound: totalFound,
      hasMore: endIdx < totalFound,
      batch: batch
    });

  } catch (error) {
    console.error('Error finding nearby stores:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});