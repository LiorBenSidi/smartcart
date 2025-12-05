import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin
    let isAdmin = user.email === "liorben@base44.com";
    if (!isAdmin) {
      const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
      isAdmin = profiles.length > 0 && !!profiles[0].isAdmin;
    }

    if (!isAdmin) {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get file from form
    const form = await req.formData();
    const file = form.get("xmlFile");

    if (!file) {
      return Response.json({ error: "Missing xmlFile" }, { status: 400 });
    }

    // Decompress .gz
    const buffer = await file.arrayBuffer();
    const xmlText = new TextDecoder().decode(gunzipSync(new Uint8Array(buffer)));

    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    const root = parser.parse(xmlText).root;

    const chainId = root.ChainId || "";
    const storeId = root.StoreId || "";
    const subChainId = root.SubChainId || "";

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    const svc = base44.asServiceRole;

    // Get or create chain
    let chain = (await svc.entities.Chain.filter({ external_chain_id: chainId }))[0];
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: chainId,
        external_chain_id: chainId
      });
    }

    // Get or create store
    let store = (await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_id: storeId
    }))[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `Store ${storeId}`
      });
    }

    // Load existing products and prices
    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map(existingProducts.map(p => [p.external_item_code, p]));
    const priceMap = new Map(existingPrices.map(p => [p.product_id, p]));

    let processed = 0;
    let failed = 0;

    // Process items
    for (const it of items) {
      try {
        const code = it.ItemCode?.toString().trim();
        if (!code) continue;

        // Upsert product
        let product = productMap.get(code);
        const productData = {
          chain_id: chain.id,
          external_item_code: code,
          name: it.ItemName || "",
          brand: it.ManufacturerName || "",
          description: it.ManufacturerItemDescription || "",
          unit_of_measure: it.UnitOfMeasure || "",
          unit_qty: it.UnitQty || "",
          qty_in_package: parseNumber(it.QtyInPackage),
          is_weighted: String(it.bIsWeighted || "") === "1",
          item_type: it.ItemType || "",
          status: it.ItemStatus || ""
        };

        if (!product) {
          product = await svc.entities.Product.create(productData);
          productMap.set(code, product);
        } else {
          await svc.entities.Product.update(product.id, productData);
        }

        // Upsert price
        let price = priceMap.get(product.id);
        const priceData = {
          product_id: product.id,
          store_id: store.id,
          price: parseNumber(it.ItemPrice),
          unit_price: parseNumber(it.UnitOfMeasurePrice),
          allow_discount: String(it.AllowDiscount || "") === "1",
          price_update_at: it.PriceUpdateDate || new Date().toISOString()
        };

        if (!price) {
          await svc.entities.ProductPrice.create(priceData);
          priceMap.set(product.id, price);
        } else {
          await svc.entities.ProductPrice.update(price.id, priceData);
        }

        processed++;
      } catch (err) {
        failed++;
      }
    }

    return Response.json({
      success: true,
      chainId,
      storeId,
      totalItems: items.length,
      processed,
      failed
    });

  } catch (err) {
    return Response.json({
      error: err.message || String(err)
    }, { status: 500 });
  }
});