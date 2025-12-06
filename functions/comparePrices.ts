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

    // Load all products for this chain
    const products = await svc.entities.Product.filter({ chain_id: store.chain_id });
    const productMap = new Map(products.map(p => [p.external_item_code, p]));

    // Load all prices for this store
    const prices = await svc.entities.ProductPrice.filter({ store_id: store.id });
    const priceMap = new Map(prices.map(p => [p.product_id, p]));

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

      const product = productMap.get(code);
      if (!product) {
        results.push({
          item,
          status: "not_found",
          message: "Product not found in catalog"
        });
        continue;
      }

      const catalogPrice = priceMap.get(product.id);
      if (!catalogPrice) {
        results.push({
          item,
          product,
          status: "no_catalog_price",
          message: "No catalog price available"
        });
        continue;
      }

      const receiptPrice = parseFloat(item.price) || 0;
      const dbPrice = catalogPrice.price || 0;
      const difference = Math.abs(receiptPrice - dbPrice);

      if (difference > 0.01) {
        results.push({
          item,
          product,
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
          product,
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