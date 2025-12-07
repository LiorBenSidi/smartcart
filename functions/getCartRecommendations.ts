import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { cartItems, store_id } = body;

    if (!cartItems || !store_id) {
      return Response.json({ error: "cartItems and store_id required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Load user profile
    const profiles = await svc.entities.UserProfile.filter({ created_by: user.email });
    const userProfile = profiles.length > 0 ? profiles[0] : {};

    // Load store and chain info
    const stores = await svc.entities.Store.filter({ id: store_id });
    if (stores.length === 0) {
      return Response.json({ error: "Store not found" }, { status: 404 });
    }
    const currentStore = stores[0];
    
    // Load all products and prices
    const allProducts = await svc.entities.Product.list();
    const allPrices = await svc.entities.ProductPrice.list();
    const allStores = await svc.entities.Store.list();

    // Create lookup maps
    const productsByGtin = new Map(allProducts.map(p => [p.gtin, p]));
    const pricesByGtin = new Map();
    for (const price of allPrices) {
      if (!pricesByGtin.has(price.gtin)) {
        pricesByGtin.set(price.gtin, []);
      }
      pricesByGtin.get(price.gtin).push(price);
    }
    const storesById = new Map(allStores.map(s => [s.id, s]));

    const recommendations = [];

    // Process each cart item
    for (const cartItem of cartItems) {
      const product = productsByGtin.get(cartItem.gtin);
      if (!product) continue;

      const currentPrices = pricesByGtin.get(cartItem.gtin) || [];
      const currentPrice = currentPrices.find(p => p.store_id === store_id);
      const currentPriceValue = currentPrice?.current_price || 0;

      // Find alternatives
      const alternatives = [];

      for (const [gtin, altProduct] of productsByGtin.entries()) {
        if (gtin === cartItem.gtin) continue; // Skip same product

        // Filter by dietary restrictions
        if (userProfile.dietary_restrictions?.length > 0) {
          if (userProfile.dietary_restrictions.includes('vegan') && !altProduct.is_vegan) continue;
          if (userProfile.dietary_restrictions.includes('vegetarian') && altProduct.category === 'Meat') continue;
          if (userProfile.dietary_restrictions.includes('gluten_free') && !altProduct.is_gluten_free) continue;
          if (userProfile.dietary_restrictions.includes('lactose_free') && !altProduct.is_lactose_free) continue;
        }

        // Filter by allergens
        if (userProfile.allergen_avoid_list?.length > 0 && altProduct.allergen_tags?.length > 0) {
          const hasAllergen = altProduct.allergen_tags.some(a => 
            userProfile.allergen_avoid_list.includes(a)
          );
          if (hasAllergen) continue;
        }

        // Filter by kashrut
        if (userProfile.kashrut_level && userProfile.kashrut_level !== 'none') {
          if (!altProduct.is_kosher) continue;
        }

        // Match category and subcategory
        if (altProduct.category !== product.category) continue;
        if (product.subcategory && altProduct.subcategory !== product.subcategory) continue;

        // Get prices for this alternative
        const altPrices = pricesByGtin.get(gtin) || [];
        
        // Try same store first
        let bestPrice = altPrices.find(p => p.store_id === store_id);
        let priceStore = currentStore;
        let storeLevel = 'same_store';

        // If not in same store, try same chain
        if (!bestPrice) {
          const sameChainPrices = altPrices.filter(p => {
            const s = storesById.get(p.store_id);
            return s && s.chain_id === currentStore.chain_id;
          });
          if (sameChainPrices.length > 0) {
            sameChainPrices.sort((a, b) => a.current_price - b.current_price);
            bestPrice = sameChainPrices[0];
            priceStore = storesById.get(bestPrice.store_id);
            storeLevel = 'same_chain';
          }
        }

        // If still not found, try other stores
        if (!bestPrice && altPrices.length > 0) {
          altPrices.sort((a, b) => a.current_price - b.current_price);
          bestPrice = altPrices[0];
          priceStore = storesById.get(bestPrice.store_id);
          storeLevel = 'other_store';
        }

        if (!bestPrice) continue;

        // Calculate savings
        const priceDiff = currentPriceValue - bestPrice.current_price;
        const savingsPercent = currentPriceValue > 0 ? (priceDiff / currentPriceValue) * 100 : 0;

        // Determine reason
        const reasons = [];
        if (priceDiff > 0.5) reasons.push('cheaper');
        if (userProfile.preferred_brands?.includes(altProduct.brand_name)) reasons.push('preferred brand');
        if (userProfile.avoided_brands?.includes(product.brand_name)) reasons.push('avoiding current brand');
        if (altProduct.is_organic && userProfile.health_preferences?.includes('organic')) reasons.push('organic');
        if (altProduct.nutritional_info_per_100g?.sugar < product.nutritional_info_per_100g?.sugar) reasons.push('less sugar');
        if (altProduct.nutritional_info_per_100g?.sodium < product.nutritional_info_per_100g?.sodium) reasons.push('less sodium');
        if (storeLevel === 'same_store') reasons.push('available here');

        // Calculate score
        let score = 0;
        if (storeLevel === 'same_store') score += 100;
        if (storeLevel === 'same_chain') score += 50;
        score += savingsPercent * 10; // Prioritize savings
        if (userProfile.preferred_brands?.includes(altProduct.brand_name)) score += 30;
        if (altProduct.is_organic && userProfile.health_preferences?.includes('organic')) score += 20;

        alternatives.push({
          product: altProduct,
          price: bestPrice.current_price,
          store: priceStore,
          storeLevel,
          priceDiff,
          savingsPercent,
          reasons,
          score
        });
      }

      // Sort by score and take top 3
      alternatives.sort((a, b) => b.score - a.score);
      const topAlternatives = alternatives.slice(0, 3);

      recommendations.push({
        originalItem: cartItem,
        originalProduct: product,
        originalPrice: currentPriceValue,
        alternatives: topAlternatives
      });
    }

    return Response.json({ recommendations });

  } catch (error) {
    console.error("Cart recommendations error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});