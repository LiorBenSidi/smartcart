import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

// Helpers
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

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

    // Must be admin
    const user = await base44.auth.me();
    console.log("[uploadCatalog] User:", user?.email);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    let isAdmin = user.email === "liorben@base44.com";
    try {
      if (!isAdmin) {
        const profiles = await base44.entities.UserProfile.filter({
          created_by: user.email
        });
        isAdmin = profiles.length > 0 && !!profiles[0].isAdmin;
      }
    } catch {}

    if (!isAdmin) return jsonResponse({ error: "Admin access required" }, 403);

    // Expect multipart with XML file
    const contentType = req.headers.get("content-type") || "";
    console.log("[uploadCatalog] Content-Type:", contentType);
    if (!contentType.startsWith("multipart/form-data")) {
      return jsonResponse({ error: "Expected multipart/form-data with xmlFile" }, 400);
    }

    console.log("[uploadCatalog] Parsing form data");
    const form = await req.formData();
    const file = form.get("xmlFile");
    console.log("[uploadCatalog] File received:", file?.name, file?.size);

    if (!file) {
      return jsonResponse({ error: "Missing xmlFile field" }, 400);
    }

    // Read file as buffer
    const buffer = await file.arrayBuffer();
    const compressedData = new Uint8Array(buffer);

    // Decompress .gz file
    let xmlText;
    try {
      xmlText = new TextDecoder().decode(gunzipSync(compressedData));
    } catch (e) {
      return jsonResponse({ error: "Failed to decompress .gz file", details: e.message }, 400);
    }

    // Parse XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    let root;
    try {
      root = parser.parse(xmlText).root;
    } catch (e) {
      return jsonResponse({ error: "Invalid XML format", details: e.message }, 400);
    }

    const chainId = root.ChainId || "";
    const subChainId = root.SubChainId || "";
    const storeId = root.StoreId || "";

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    const svc = base44.asServiceRole;

    // --- UPSERT CHAIN
    let chain = (await svc.entities.Chain.filter({
      external_chain_id: chainId
    }))[0];

    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: chainId || "Unknown Chain",
        external_chain_id: chainId
      });
    }

    // --- UPSERT STORE
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

    // Preload existing products + prices
    const existingProducts = await svc.entities.Product.filter({
      chain_id: chain.id
    });

    const existingPrices = await svc.entities.ProductPrice.filter({
      store_id: store.id
    });

    const productMap = new Map(existingProducts.map(p => [p.external_item_code, p]));
    const priceMap = new Map(existingPrices.map(p => [p.product_id, p]));

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

        // UPSERT PRODUCT
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
        failed++;
      }
    }

    return jsonResponse({
      success: true,
      chainId,
      storeId,
      totalItems: items.length,
      processed,
      failed
    });

  } catch (err) {
    console.error("[uploadCatalog] Fatal error:", err.message);
    console.error("[uploadCatalog] Error stack:", err.stack);
    return jsonResponse({
      error: err.message || String(err),
      stack: err.stack
    }, 500);
  }
});