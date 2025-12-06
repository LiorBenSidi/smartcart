import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

Deno.serve(async (req) => {
  try {
    // Step 1: Authenticate
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

    // Step 2: Get file URL from request
    const body = await req.json();
    const fileUrl = body.fileUrl;

    if (!fileUrl) {
      return Response.json({ error: "fileUrl is required" }, { status: 400 });
    }

    // Step 3: Fetch and unzip .gz file
    const fileResponse = await fetch(fileUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressed = gunzipSync(new Uint8Array(compressedBuffer));
    const xmlText = new TextDecoder("utf-8").decode(decompressed);

    // Step 4: Parse XML to JSON
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    const parsed = parser.parse(xmlText);
    const root = parsed.root;

    if (!root) {
      return Response.json({ error: "Invalid XML structure" }, { status: 400 });
    }

    // Step 5: Extract data
    const chainId = root.ChainId?.toString() || "";
    const storeId = root.StoreId?.toString() || "";
    const subChainId = root.SubChainId?.toString() || "";

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) {
      items = [items];
    }

    // Step 6: Update entities using service role
    const svc = base44.asServiceRole;

    // Create or get chain
    let chains = await svc.entities.Chain.filter({ external_chain_id: chainId });
    let chain = chains[0];
    
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: chainId,
        external_chain_id: chainId
      });
    }

    // Create or get store
    let stores = await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_id: storeId
    });
    let store = stores[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `Store ${storeId}`
      });
    }

    // Load existing products and prices for this chain/store
    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map();
    for (const p of existingProducts) {
      productMap.set(p.external_item_code, p);
    }

    const priceMap = new Map();
    for (const pr of existingPrices) {
      priceMap.set(pr.product_id, pr);
    }

    // Process items
    let processed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const itemCode = item.ItemCode?.toString().trim();
        if (!itemCode) continue;

        // Product data
        const productData = {
          chain_id: chain.id,
          external_item_code: itemCode,
          name: item.ItemName || "",
          brand: item.ManufacturerName || "",
          description: item.ManufacturerItemDescription || "",
          unit_of_measure: item.UnitOfMeasure || "",
          unit_qty: item.UnitQty || "",
          qty_in_package: parseFloat(item.QtyInPackage) || 0,
          is_weighted: item.bIsWeighted === "1",
          item_type: item.ItemType || "",
          status: item.ItemStatus || ""
        };

        // Create or update product
        let product = productMap.get(itemCode);
        if (!product) {
          product = await svc.entities.Product.create(productData);
          productMap.set(itemCode, product);
        } else {
          await svc.entities.Product.update(product.id, productData);
        }

        // Price data
        const priceData = {
          product_id: product.id,
          store_id: store.id,
          price: parseFloat(item.ItemPrice) || 0,
          unit_price: parseFloat(item.UnitOfMeasurePrice) || 0,
          allow_discount: item.AllowDiscount === "1",
          price_update_at: item.PriceUpdateDate || new Date().toISOString()
        };

        // Create or update price
        let price = priceMap.get(product.id);
        if (!price) {
          await svc.entities.ProductPrice.create(priceData);
        } else {
          await svc.entities.ProductPrice.update(price.id, priceData);
        }

        processed++;
      } catch (err) {
        console.error("Item processing error:", err);
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

  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ 
      error: error.message || "Upload failed" 
    }, { status: 500 });
  }
});