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

    // Load user profile for constraints
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    const profile = profiles.length > 0 ? profiles[0] : null;

    // Load all necessary data
    // Note: Product entity contains prices directly (current_price, chain_id, store_id)
    // For products, we only need to fetch those matching the cart items
    const cartGtins = cartItems.map(item => item.gtin);
    
    // Fetch products for the specific GTINs in the cart (can have multiple per gtin from different chains)
    const productPromises = cartGtins.map(gtin => svc.entities.Product.filter({ gtin }));
    
    const [productResults, allStores, allChains] = await Promise.all([
      Promise.all(productPromises),
      svc.entities.Store.list(),
      svc.entities.Chain.list()
    ]);
    
    // Flatten product results
    const allProducts = productResults.flat();
    
    console.log(`Found ${allProducts.length} product records for ${cartGtins.length} GTINs`);

    // Create lookup maps
    const productsByGtin = new Map();
    const storesById = new Map(allStores.map(s => [s.id, s]));
    const chainsById = new Map(allChains.map(c => [c.id, c]));
    
    // Group products (which contain prices) by store and chain
    const pricesByStore = new Map();
    const pricesByChain = new Map();
    
    for (const product of allProducts) {
      // Index by gtin for quick lookup
      if (!productsByGtin.has(product.gtin)) {
        productsByGtin.set(product.gtin, product);
      }
      
      // Products have chain_id and optional store_id with current_price
      if (product.current_price) {
        if (product.store_id) {
          if (!pricesByStore.has(product.store_id)) {
            pricesByStore.set(product.store_id, new Map());
          }
          pricesByStore.get(product.store_id).set(product.gtin, product);
        } 
        
        // Always add to chain prices if chain_id exists (not else-if)
        if (product.chain_id) {
          if (!pricesByChain.has(product.chain_id)) {
            pricesByChain.set(product.chain_id, new Map());
          }
          pricesByChain.get(product.chain_id).set(product.gtin, product);
        }
      }
    }
    
    console.log(`pricesByChain has ${pricesByChain.size} chains`);
    
    // Debug: show which chains have this product
    for (const [chainId, chainPrices] of pricesByChain) {
      const chain = chainsById.get(chainId);
      console.log(`Chain ${chain?.name || chainId}: ${chainPrices.size} products`);
      for (const [gtin, product] of chainPrices) {
        console.log(`  - ${gtin}: ₪${product.current_price}`);
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

    // Filter chains/stores based on profile constraints (e.g. Kosher)
    const validChainResults = Array.from(chainResults.values()).filter(result => {
        // If user requires kosher, ensure chain or its stores are likely kosher
        // This is a heuristic since we don't have chain-level tags, but we can check if chain type is 'kosher_store'
        // or check if we are filtering specific stores later. 
        // Better to filter stores first, but we aggregated by chain.
        // Let's filter the `chainResults` if the chain itself is incompatible? 
        // Actually, let's filter the *stores* before aggregation if we want to be strict.
        // But for now, let's just apply a simple filter if possible.
        if (profile?.kashrut_level && profile.kashrut_level !== 'none') {
             // If chain is explicitly non-kosher (e.g. Tiv Taam often is, but has kosher branches)
             // We'll rely on store-level tags later.
             return true; 
        }
        return true;
    });

    // Sort chains by total cost and take top 3
    const sortedChains = validChainResults
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

      // Apply User Profile Constraints to the selected store
      let passesConstraints = true;
      if (profile && nearestBranch) {
          // Kashrut Check
          if (profile.kashrut_level && profile.kashrut_level !== 'none') {
              // If user wants kosher, but store is not marked kosher_certified or religious_friendly
              // (Assuming 'kosher_certified' tag exists)
              const isKosher = nearestBranch.store_tags?.includes('kosher_certified') || nearestBranch.store_tags?.includes('religious_friendly');
              if (!isKosher) passesConstraints = false;
          }
      }

      if (passesConstraints) {
          // Collect item prices for this chain
          const itemPrices = [];
          const chainPrices = pricesByChain.get(chainResult.chain.id) || new Map();
          
          for (const cartItem of cartItems) {
            let itemPrice = null;
            
            // First try to find store-specific prices for stores in this chain
            for (const store of allStores) {
              if (store.chain_id === chainResult.chain.id) {
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
              itemPrices.push({ gtin: cartItem.gtin, price: itemPrice });
            }
          }
          
          topStores.push({
            chain: chainResult.chain,
            store: nearestBranch,
            nearestBranch,
            totalCost: chainResult.totalCost,
            availableItems: chainResult.availableItems,
            distance: minDistance !== Infinity ? minDistance : null,
            itemPrices // Include item prices in response
          });
      }
    }

    // --- Smart Cart Optimization: Split Cart Strategy ---
    // Calculate cheapest possible cost if we buy each item at its cheapest store
    let splitCartTotal = 0;
    let splitCartAvailableItems = 0;
    const splitCartItems = []; // { gtin, store, price, quantity }

    for (const cartItem of cartItems) {
      let bestPrice = Infinity;
      let bestStore = null;

      // Scan all stores for this item
      for (const [storeId, storePrices] of pricesByStore) {
        if (storePrices.has(cartItem.gtin)) {
           const price = storePrices.get(cartItem.gtin).current_price;
           if (price < bestPrice) {
             bestPrice = price;
             bestStore = storesById.get(storeId);
           }
        }
      }

      // Fallback to chain prices if no specific store price
      if (bestPrice === Infinity) {
          for (const [chainId, chainPrices] of pricesByChain) {
              if (chainPrices.has(cartItem.gtin)) {
                  const price = chainPrices.get(cartItem.gtin).current_price;
                  if (price < bestPrice) {
                      bestPrice = price;
                      // Just pick first store of this chain as representative?
                      // Or indicate it's a chain-level price.
                      const chain = chainsById.get(chainId);
                      bestStore = { name: chain.name + " (Any Branch)", id: "chain_" + chainId };
                  }
              }
          }
      }

      if (bestPrice !== Infinity) {
        splitCartTotal += bestPrice * cartItem.quantity;
        splitCartAvailableItems++;
        splitCartItems.push({
          gtin: cartItem.gtin,
          store: bestStore,
          price: bestPrice,
          quantity: cartItem.quantity
        });
      }
    }
    
    // Only suggest split cart if it offers savings > 5% compared to best single store
    // and if we have a best single store to compare with
    let optimizedCart = null;
    if (topStores.length > 0) {
        const bestSingleStoreTotal = topStores[0].totalCost;
        if (splitCartTotal < bestSingleStoreTotal * 0.95 && splitCartAvailableItems === cartItems.length) {
            optimizedCart = {
                type: "SPLIT_CART",
                totalCost: splitCartTotal,
                originalCost: bestSingleStoreTotal,
                savings: bestSingleStoreTotal - splitCartTotal,
                items: splitCartItems
            };
        }
    }


    // Enrich with OSRM real distance/duration
    if (userLat && userLon && topStores.length > 0) {
        await Promise.all(topStores.map(async (item) => {
            if (item.nearestBranch) {
                try {
                    const res = await base44.functions.invoke('getRoute', {
                        origin: { lat: userLat, lon: userLon },
                        destination: { lat: item.nearestBranch.latitude, lon: item.nearestBranch.longitude },
                        mode: 'driving'
                    });

                    if (res.data && res.data.distance) {
                        const distKm = (res.data.distance / 1000).toFixed(1) + " km";
                        const minutes = Math.round(res.data.duration / 60);
                        const durationText = minutes > 60 
                            ? `${Math.floor(minutes/60)} hr ${minutes%60} min` 
                            : `${minutes} min`;

                        item.drivingInfo = {
                            distance: distKm,
                            duration: durationText
                        };
                    }
                } catch (e) {
                    console.error("Routing error", e.message);
                }
            }
        }));
    }

    return Response.json({ topStores, optimizedCart });

  } catch (error) {
    console.error("Cart recommendations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});