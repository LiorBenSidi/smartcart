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

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { latitude, longitude, batch = 0 } = await req.json().catch(() => ({}));

    if (!latitude || !longitude) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    const BATCH_SIZE = 50;
    const skip = batch * BATCH_SIZE;

    // Fetch batch of stores
    // Using list instead of filter since we want all to check distance
    const stores = await base44.entities.Store.list('-created_date', BATCH_SIZE, skip);
    
    // Fetch chains (cacheable, but for now fetch all is safer or fetch unique IDs)
    // Optimization: Collect chain IDs
    const chainIds = [...new Set(stores.map(s => typeof s.chain_id === 'object' ? s.chain_id.id : s.chain_id))];
    const chains = await Promise.all(chainIds.map(id => base44.entities.Chain.filter({ id })));
    const flatChains = chains.flat();
    const chainMap = new Map(flatChains.map(c => [c.id, c]));

    // Fetch Sentiments for this batch
    // We can't do $in easily, so we might need to fetch individually or fetch recent global
    // Let's try to fetch sentiments for these stores. 
    // Optimization: For this batch, parallel fetch sentiments
    const sentimentPromises = stores.map(s => base44.entities.StoreSentiment.filter({ store_id: s.id }, '-created_date', 1));
    const sentimentsResults = await Promise.all(sentimentPromises);
    const sentimentMap = new Map();
    stores.forEach((store, idx) => {
        if (sentimentsResults[idx] && sentimentsResults[idx].length > 0) {
            sentimentMap.set(store.id, sentimentsResults[idx][0]);
        }
    });

    const processedStores = stores.map(store => {
        const chainId = typeof store.chain_id === 'object' && store.chain_id !== null ? store.chain_id.id : store.chain_id;
        const chain = chainMap.get(chainId);
        const sentiment = sentimentMap.get(store.id);

        const dist = calculateDistance(latitude, longitude, store.latitude, store.longitude);

        return {
            ...store,
            distance: dist,
            chain_name: chain?.name || 'Unknown Chain',
            chain_logo: chain?.logo_url,
            chain_id: chainId,
            sentiment: sentiment ? sentiment.overall_sentiment : null,
            // Use entity field for average_rating to avoid fetching all reviews
            average_rating: store.average_rating || 0,
            review_count: store.review_count || 0
        };
    });

    // Filter out stores with invalid coordinates or extremely far (optional, e.g. > 100km)
    // But returning all allows frontend to decide
    
    return Response.json({
        stores: processedStores,
        batch,
        hasMore: stores.length === BATCH_SIZE
    });

  } catch (error) {
    console.error('Error finding nearby stores:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});