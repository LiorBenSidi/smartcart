import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to process in batches
async function processBatch(items, batchSize, delayMs, processFn, label) {
  const totalBatches = Math.ceil(items.length / batchSize);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    const remaining = items.length - (i + batch.length);
    
    console.log(`[${label}] Processing batch ${currentBatch}/${totalBatches} (${batch.length} items, ${remaining} remaining)`);
    
    await processFn(batch);
    
    if (i + batchSize < items.length) {
      console.log(`[${label}] Waiting ${delayMs}ms before next batch...`);
      await delay(delayMs);
    }
  }
}

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

    // Step 2: Get file URL and chain name from request
    const body = await req.json();
    const fileUrl = body.fileUrl;
    const chainName = body.chain_name;

    if (!fileUrl) {
      return Response.json({ error: "fileUrl is required" }, { status: 400 });
    }
    
    if (!chainName) {
      return Response.json({ error: "chain_name is required" }, { status: 400 });
    }

    // Step 3: Fetch and unzip .gz file
    console.log("Fetching and decompressing file...");
    const fileResponse = await fetch(fileUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressed = gunzipSync(new Uint8Array(compressedBuffer));
    let xmlText = new TextDecoder("utf-8").decode(decompressed);

    // Ensure XML declaration is present if missing
    if (!xmlText.trim().startsWith('<?xml')) {
      xmlText = '<?xml version="1.0" encoding="utf-8"?>\n' + xmlText;
    }

    // Step 4: Parse XML to JSON
    console.log("Parsing XML...");
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
      ignoreDeclaration: true
    });

    const parsed = parser.parse(xmlText);
    // Dynamically get the root element regardless of its casing (root or Root)
    const rootKey = Object.keys(parsed)[0];
    const root = parsed[rootKey];

    if (!root) {
      return Response.json({ error: "Invalid XML structure" }, { status: 400 });
    }

    // Step 5: Extract data
    const chainId = root.ChainId?.toString() || "";
    const storeId = root.StoreId?.toString() || "";
    const subChainId = root.SubChainId?.toString() || "";

    console.log("Root keys:", Object.keys(root));
    console.log("Root.Items:", root.Items);
    console.log("Root.Items type:", typeof root.Items);
    if (root.Items) {
      console.log("Root.Items keys:", Object.keys(root.Items));
      console.log("Root.Items.Item:", root.Items.Item);
    }
    
    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) {
      items = [items];
    }

    console.log(`Found ${items.length} items to process`);

    // Step 6: Update entities using service role
    const svc = base44.asServiceRole;

    // Create or get chain - use the provided chain name
    console.log("Setting up chain and store...");
    let chains = await svc.entities.Chain.filter({ external_chain_code: chainId });
    let chain = chains[0];
    
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: chainName,
        external_chain_code: chainId
      });
    } else {
      // Update chain name if provided
      await svc.entities.Chain.update(chain.id, {
        name: chainName
      });
      chain.name = chainName;
    }

    // Create or get store - use chain_id + external_store_code + sub_chain_code as unique identifier
    let stores = await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_code: storeId,
      sub_chain_code: subChainId
    });
    let store = stores[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_code: storeId,
        sub_chain_code: subChainId,
        name: `Store ${storeId}`
      });
    } else {
      // Update store name if needed
      await svc.entities.Store.update(store.id, {
        chain_id: chain.id,
        external_store_code: storeId,
        sub_chain_code: subChainId,
        name: `Store ${storeId}`
      });
    }

    // Load existing products and prices
    console.log("Loading existing products and prices...");
    const existingProducts = await svc.entities.Product.list();
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map();
    for (const p of existingProducts) {
      productMap.set(p.gtin, p);
    }

    const priceMap = new Map();
    for (const pr of existingPrices) {
      priceMap.set(pr.gtin, pr);
    }

    // Prepare bulk operations
    console.log("Preparing product data...");
    const newProducts = [];
    const updateProducts = [];

    for (const item of items) {
      const itemCode = item.ItemCode?.toString().trim();
      if (!itemCode) continue;

      const productData = {
        gtin: itemCode,
        canonical_name: item.ItemName || "",
        brand_name: item.ManufacturerName || "",
        description: item.ManufacturerItemDescription || "",
        unit_of_measure: item.UnitOfMeasure || "",
        unit_quantity: parseFloat(item.UnitQty) || 0,
        package_quantity: parseFloat(item.QtyInPackage) || 0,
        is_weight_based: item.bIsWeighted === "1"
      };

      let product = productMap.get(itemCode);
      if (!product) {
        newProducts.push(productData);
      } else {
        updateProducts.push({ id: product.id, data: productData });
      }
      productMap.set(itemCode, product || { id: null, gtin: itemCode });
    }

    // Bulk create new products
    console.log(`Creating ${newProducts.length} new products...`);
    if (newProducts.length > 0) {
      const createdProducts = await svc.entities.Product.bulkCreate(newProducts);
      for (const p of createdProducts) {
        productMap.set(p.gtin, p);
      }
    }

    // Update existing products in batches with delay
    if (updateProducts.length > 0) {
      console.log(`Updating ${updateProducts.length} existing products in batches...`);
      await processBatch(
        updateProducts,
        50, // batch size
        2000, // delay 2 seconds between batches
        async (batch) => {
          for (const update of batch) {
            await svc.entities.Product.update(update.id, update.data);
          }
        },
        "Product Updates"
      );
    }

    // Now prepare prices
    console.log("Preparing price data...");
    const newPrices = [];
    const updatePrices = [];

    for (const item of items) {
      const itemCode = item.ItemCode?.toString().trim();
      if (!itemCode) continue;

      const priceData = {
        gtin: itemCode,
        store_id: store.id,
        current_price: parseFloat(item.ItemPrice) || 0,
        unit_price: parseFloat(item.UnitOfMeasurePrice) || 0,
        allow_discount: item.AllowDiscount === "1",
        price_updated_at: item.PriceUpdateDate || new Date().toISOString()
      };

      let price = priceMap.get(itemCode);
      if (!price) {
        newPrices.push(priceData);
      } else {
        updatePrices.push({ id: price.id, data: priceData });
      }
    }

    // Bulk create new prices
    console.log(`Creating ${newPrices.length} new prices...`);
    if (newPrices.length > 0) {
      await svc.entities.ProductPrice.bulkCreate(newPrices);
    }

    // Update existing prices in batches with delay
    if (updatePrices.length > 0) {
      console.log(`Updating ${updatePrices.length} existing prices in batches...`);
      await processBatch(
        updatePrices,
        50, // batch size
        2000, // delay 2 seconds between batches
        async (batch) => {
          for (const update of batch) {
            await svc.entities.ProductPrice.update(update.id, update.data);
          }
        },
        "Price Updates"
      );
    }

    console.log("Processing complete!");

    return Response.json({
      success: true,
      chainId,
      storeId,
      totalItems: items.length,
      processed: items.length,
      newProducts: newProducts.length,
      updatedProducts: updateProducts.length,
      newPrices: newPrices.length,
      updatedPrices: updatePrices.length
    });

  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ 
      error: error.message || "Upload failed" 
    }, { status: 500 });
  }
});