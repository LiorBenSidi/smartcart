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

    const { latitude, longitude, radius } = await req.json();

    if (!latitude || !longitude) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    // Fetch all stores and chains (limit 1000 for both to cover everything)
    const [stores, chains] = await Promise.all([
        base44.entities.Store.list('-created_date', 1000),
        base44.entities.Chain.list('-created_date', 1000)
    ]);

    const chainMap = new Map(chains.map(c => [c.id, c]));

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

    // Calculate recommendation score for each store
    const storesWithScores = nearbyStores.map(store => {
      let score = 0;
      
      // Proximity score (closer is better)
      // Assuming 5km radius logic for scoring, but valid for larger if radius not set
      const scoreRadius = radius || 10;
      score += Math.max(0, (scoreRadius - store.distance) / scoreRadius * 30);

      // User preference score (if they've shopped there before)
      const storeReceipts = receipts.filter(r => r.store_id === store.id);
      if (storeReceipts.length > 0) {
        score += 20;
      }

      // Store tags matching user preferences
      if (userProfile) {
        if (userProfile.kashrut_level !== 'none' && store.store_tags?.includes('kosher_certified')) {
          score += 25;
        }
        if (userProfile.health_preferences?.includes('organic') && store.store_tags?.includes('organic_focused')) {
          score += 15;
        }
        if (userProfile.budget_focus === 'save_money' && store.store_tags?.includes('discount_store')) {
          score += 20;
        }
      }

      return { ...store, recommendationScore: score };
    });

    // Sort by recommendation score
    storesWithScores.sort((a, b) => b.recommendationScore - a.recommendationScore);

    const recommendedStore = storesWithScores[0];

    // Enrich with OSRM real distance/duration
    // Only fetch for top 10 stores to avoid overloading OSRM or timeout
    const storesToEnrich = storesWithScores.slice(0, 10);
    
    // Process in parallel
    await Promise.all(storesToEnrich.map(async (store) => {
        try {
            const res = await base44.functions.invoke('getRoute', {
                origin: { lat: latitude, lon: longitude },
                destination: { lat: store.latitude, lon: store.longitude },
                mode: 'driving'
            });
            
            if (res.data && res.data.distance) {
                // Convert meters to km or text
                const distKm = (res.data.distance / 1000).toFixed(1) + " km";
                // Convert seconds to readable string
                const minutes = Math.round(res.data.duration / 60);
                const durationText = minutes > 60 
                    ? `${Math.floor(minutes/60)} hr ${minutes%60} min` 
                    : `${minutes} min`;

                store.drivingInfo = {
                    distance: distKm,
                    duration: durationText,
                    rawDuration: res.data.duration, // seconds
                    rawDistance: res.data.distance  // meters
                };
            }
        } catch (e) {
            // Ignore routing errors, fallback to linear distance
            console.error("Routing error for store", store.name, e.message);
        }
    }));

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