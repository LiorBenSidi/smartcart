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
  console.log("[uploadCatalog] Function invoked");
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    console.log("[uploadCatalog] User:", user?.email);
    
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Check admin
    let isAdmin = user.email === "liorben@base44.com";
    if (!isAdmin) {
      const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
      isAdmin = profiles.length > 0 && !!profiles[0].isAdmin;
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse multipart form data
    const contentType = req.headers.get("content-type") || "";
    console.log("[uploadCatalog] Content-Type:", contentType);
    
    if (!contentType.startsWith("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log("[uploadCatalog] Parsing form data");
    const form = await req.formData();
    const file = form.get("xmlFile");
    console.log("[uploadCatalog] File:", file?.name, file?.size);

    if (!file) {
      return new Response(JSON.stringify({ error: "Missing xmlFile field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Read and decompress
    console.log("[uploadCatalog] Reading file buffer");
    const buffer = await file.arrayBuffer();
    const compressedData = new Uint8Array(buffer);
    
    console.log("[uploadCatalog] Decompressing .gz file");
    let xmlText;
    try {
      xmlText = new TextDecoder().decode(gunzipSync(compressedData));
      console.log("[uploadCatalog] Decompressed XML length:", xmlText.length);
    } catch (e) {
      console.error("[uploadCatalog] Decompression error:", e.message);
      return new Response(JSON.stringify({ 
        error: "Failed to decompress .gz file", 
        details: e.message 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse XML
    console.log("[uploadCatalog] Parsing XML");
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    let root;
    try {
      root = parser.parse(xmlText).root;
      console.log("[uploadCatalog] XML parsed successfully");
    } catch (e) {
      console.error("[uploadCatalog] XML parse error:", e.message);
      return new Response(JSON.stringify({ 
        error: "Invalid XML format", 
        details: e.message 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const chainId = root.ChainId || "";
    const subChainId = root.SubChainId || "";
    const storeId = root.StoreId || "";
    console.log("[uploadCatalog] Chain:", chainId, "Store:", storeId);

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];
    console.log("[uploadCatalog] Items count:", items.length);

    const svc = base44.asServiceRole;

    // Upsert chain
    console.log("[uploadCatalog] Upserting chain");
    let chain = (await svc.entities.Chain.filter({ external_chain_id: chainId }))[0];
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: chainId || "Unknown Chain",
        external_chain_id: chainId
      });
    }

    // Upsert store
    console.log("[uploadCatalog] Upserting store");
    let store = (await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_id: storeId
    }))[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `${chain.name} Store ${storeId}`
      });
    }

    // Load existing data
    console.log("[uploadCatalog] Loading existing products and prices");
    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map(existingProducts.map(p => [p.external_item_code, p]));
    const priceMap = new Map(existingPrices.map(p => [p.product_id, p]));

    console.log("[uploadCatalog] Processing items");
    let processed = 0;
    let failed = 0;

    for (const it of items) {
      try {
        const code = it.ItemCode?.toString().trim();
        if (!code) continue;

        const productPayload = {
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

        let product = productMap.get(code);
        if (!product) {
          product = await svc.entities.Product.create(productPayload);
          productMap.set(code, product);
        } else {
          await svc.entities.Product.update(product.id, productPayload);
        }

        const pricePayload = {
          product_id: product.id,
          store_id: store.id,
          price: parseNumber(it.ItemPrice),
          unit_price: parseNumber(it.UnitOfMeasurePrice),
          allow_discount: String(it.AllowDiscount || "") === "1",
          price_update_at: it.PriceUpdateDate || new Date().toISOString()
        };

        let price = priceMap.get(product.id);
        if (!price) {
          price = await svc.entities.ProductPrice.create(pricePayload);
          priceMap.set(product.id, price);
        } else {
          await svc.entities.ProductPrice.update(price.id, pricePayload);
        }

        processed++;
      } catch (err) {
        console.error("[uploadCatalog] Item processing error:", err.message);
        failed++;
      }
    }

    console.log("[uploadCatalog] Processing complete:", processed, "processed,", failed, "failed");

    return new Response(JSON.stringify({
      success: true,
      chainId,
      storeId,
      totalItems: items.length,
      processed,
      failed
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[uploadCatalog] Fatal error:", err.message);
    console.error("[uploadCatalog] Error stack:", err.stack);
    return new Response(JSON.stringify({
      error: err.message || String(err),
      stack: err.stack
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});