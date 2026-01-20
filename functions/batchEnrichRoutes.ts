import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stores, origin } = await req.json();

    if (!stores || !Array.isArray(stores) || !origin) {
        return Response.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Process sequentially to respect rate limits or API constraints
    const enrichedStores = [];
    
    for (const store of stores) {
        try {
            // Check if we already have valid driving info passed in (optimization)
            if (store.drivingInfo && store.usingRouteDuration) {
                enrichedStores.push(store);
                continue;
            }

            const res = await base44.functions.invoke('getRoute', {
                origin: { lat: origin.latitude, lon: origin.longitude },
                destination: { lat: store.latitude, lon: store.longitude },
                mode: 'driving'
            });

            if (res.data && res.data.duration) {
                const minutes = Math.round(res.data.duration / 60);
                const durationText = minutes > 60 
                    ? `${Math.floor(minutes/60)} hr ${minutes%60} min` 
                    : `${minutes} min`;

                enrichedStores.push({
                    ...store,
                    rawDuration: res.data.duration,
                    usingRouteDuration: true,
                    drivingInfo: {
                        duration: durationText,
                        rawDuration: res.data.duration,
                        rawDistance: res.data.distance || null
                    }
                });
            } else {
                // Keep original if routing fails
                enrichedStores.push(store);
            }
        } catch (e) {
            console.error("Routing error for store", store.name, e.message);
            enrichedStores.push(store);
        }

        // Delay 500ms between requests to be nice to the API
        if (store !== stores[stores.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return Response.json({ stores: enrichedStores });

  } catch (error) {
    console.error('Batch enrich error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});