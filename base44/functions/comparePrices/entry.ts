import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { items, store_id } = body;

    if (!items || !store_id) {
      return Response.json({ error: "items and store_id are required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Get store details
    const stores = await svc.entities.Store.filter({ id: store_id });
    if (stores.length === 0) {
      return Response.json({ error: "Store not found" }, { status: 404 });
    }
    const store = stores[0];

    // Load store-specific prices
    const storePrices = await svc.entities.ProductPrice.filter({ store_id: store.id });
    const storePriceMap = new Map(storePrices.map(p => [p.gtin, p]));

    // Load chain-level prices (where store_id is null)
    const chainPrices = await svc.entities.ProductPrice.filter({ chain_id: store.chain_id, store_id: null });
    const chainPriceMap = new Map(chainPrices.map(p => [p.gtin, p]));

    const results = [];

    for (const item of items) {
      const code = item.code?.toString().trim();
      if (!code) {
        results.push({
          item,
          status: "no_code",
          message: "No product code found"
        });
        continue;
      }

      // Check store-specific price first, then chain-level price
      const catalogPrice = storePriceMap.get(code) || chainPriceMap.get(code);
      
      if (!catalogPrice) {
        results.push({
          item,
          status: "not_found",
          message: "Product not found in catalog for this chain"
        });
        continue;
      }

      const receiptPrice = parseFloat(item.price) || 0;
      const dbPrice = catalogPrice.current_price || 0;
      const difference = Math.abs(receiptPrice - dbPrice);

      if (difference > 0.01) {
        results.push({
          item,
          catalogPrice,
          status: "price_difference",
          receiptPrice,
          dbPrice,
          difference,
          message: `Price differs: Receipt ${receiptPrice.toFixed(2)}, Catalog ${dbPrice.toFixed(2)}`
        });
      } else {
        results.push({
          item,
          catalogPrice,
          status: "match",
          receiptPrice,
          dbPrice,
          message: "Prices match"
        });
      }
    }

    return Response.json({ results });

  } catch (error) {
    console.error("Compare prices error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});