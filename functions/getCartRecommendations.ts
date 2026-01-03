import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

// Haversine formula to calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
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
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { cartItems, userLat, userLon } = body;

    if (!cartItems || cartItems.length === 0) {
      return Response.json({ error: "cartItems required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Load all necessary data
    const [allProducts, allPrices, allStores, allChains] = await Promise.all([
      svc.entities.Product.list(),
      svc.entities.ProductPrice.list(),
      svc.entities.Store.list(),
      svc.entities.Chain.list()
    ]);

    // Create lookup maps
    const productsByGtin = new Map(allProducts.map(p => [p.gtin, p]));
    const storesById = new Map(allStores.map(s => [s.id, s]));
    const chainsById = new Map(allChains.map(c => [c.id, c]));
    
    // Group prices by store and chain
    const pricesByStore = new Map();
    const pricesByChain = new Map();
    
    for (const price of allPrices) {
      if (price.store_id) {
        if (!pricesByStore.has(price.store_id)) {
          pricesByStore.set(price.store_id, new Map());
        }
        pricesByStore.get(price.store_id).set(price.gtin, price);
      } else if (price.chain_id) {
        if (!pricesByChain.has(price.chain_id)) {
          pricesByChain.set(price.chain_id, new Map());
        }
        pricesByChain.get(price.chain_id).set(price.gtin, price);
      }
    }

    // Calculate cart total for each chain
    const chainResults = new Map();

    for (const chain of allChains) {
      let totalCost = 0;
      let availableItems = 0;
      const chainPrices = pricesByChain.get(chain.id) || new Map();

      for (const cartItem of cartItems) {
        let itemPrice = null;

        // First try to find store-specific prices for stores in this chain
        for (const store of allStores) {
          if (store.chain_id === chain.id) {
            const storePrices = pricesByStore.get(store.id);
            if (storePrices?.has(cartItem.gtin)) {
              const price = storePrices.get(cartItem.gtin);
              if (!itemPrice || price.current_price < itemPrice) {
                itemPrice = price.current_price;
              }
            }
          }
        }

        // If no store-specific price, use chain-level price
        if (!itemPrice && chainPrices.has(cartItem.gtin)) {
          itemPrice = chainPrices.get(cartItem.gtin).current_price;
        }

        if (itemPrice) {
          totalCost += itemPrice * cartItem.quantity;
          availableItems++;
        }
      }

      if (availableItems > 0) {
        chainResults.set(chain.id, {
          chain,
          totalCost,
          availableItems
        });
      }
    }

    // Sort chains by total cost and take top 3
    const sortedChains = Array.from(chainResults.values())
      .sort((a, b) => b.availableItems - a.availableItems || a.totalCost - b.totalCost)
      .slice(0, 3);

    // For each top chain, find the nearest branch if user location is available
    const topStores = [];
    for (const chainResult of sortedChains) {
      const chainStores = allStores.filter(s => s.chain_id === chainResult.chain.id);
      
      let nearestBranch = null;
      let minDistance = Infinity;

      if (userLat && userLon) {
        for (const store of chainStores) {
          if (store.latitude && store.longitude) {
            const distance = calculateDistance(userLat, userLon, store.latitude, store.longitude);
            if (distance < minDistance) {
              minDistance = distance;
              nearestBranch = store;
            }
          }
        }
      }

      // If no location available, just pick the first store
      if (!nearestBranch && chainStores.length > 0) {
        nearestBranch = chainStores[0];
      }

      topStores.push({
        chain: chainResult.chain,
        store: nearestBranch,
        nearestBranch,
        totalCost: chainResult.totalCost,
        availableItems: chainResult.availableItems,
        distance: minDistance !== Infinity ? minDistance : null
      });
    }

    // Enrich with Google Maps real distance/duration if API key is present
    const googleApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (googleApiKey && userLat && userLon && topStores.length > 0) {
      try {
        const destinations = topStores.map(item =>
          item.nearestBranch ? `${item.nearestBranch.latitude},${item.nearestBranch.longitude}` : ''
        ).filter(d => d).join('|');

        if (destinations) {
          const origin = `${userLat},${userLon}`;
          
          // Fetch Driving
          const driveUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destinations}&mode=driving&key=${googleApiKey}`;
          const driveRes = await fetch(driveUrl);
          const driveData = await driveRes.json();

          // Fetch Transit
          const transitUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destinations}&mode=transit&key=${googleApiKey}`;
          const transitRes = await fetch(transitUrl);
          const transitData = await transitRes.json();

          if (driveData.status === 'OK') {
             const elements = driveData.rows[0].elements;
             let validIndex = 0;
             for (let i = 0; i < topStores.length; i++) {
                if (topStores[i].nearestBranch) {
                   if (elements[validIndex] && elements[validIndex].status === 'OK') {
                      topStores[i].drivingInfo = {
                         distance: elements[validIndex].distance.text,
                         duration: elements[validIndex].duration.text
                      };
                   }
                   validIndex++;
                }
             }
          }

          if (transitData.status === 'OK') {
             const elements = transitData.rows[0].elements;
             let validIndex = 0;
             for (let i = 0; i < topStores.length; i++) {
                if (topStores[i].nearestBranch) {
                   if (elements[validIndex] && elements[validIndex].status === 'OK') {
                      topStores[i].transitInfo = {
                         distance: elements[validIndex].distance.text,
                         duration: elements[validIndex].duration.text
                      };
                   }
                   validIndex++;
                }
             }
          }
        }
      } catch (err) {
        console.error("Google Maps API error:", err);
      }
    }

    return Response.json({ topStores });

  } catch (error) {
    console.error("Cart recommendations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});