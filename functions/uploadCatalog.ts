import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function categorizeItems(base44, items) {
  if (items.length === 0) return;
  
  console.log(`Categorizing ${items.length} items via LLM...`);
  
  const promptItems = items.map((item, idx) => {
      // Handle both flat items (new) and update objects (existing)
      const data = item.data || item;
      return `${idx + 1}. ${data.canonical_name || data.display_name} (${data.description || ''})`;
  }).join('\n');
  
  const prompt = `Categorize the following grocery products into standard categories (e.g. "Dairy", "Meat", "Produce", "Bakery", "Beverages", "Snacks", "Pantry", "Household", "Personal Care", "Frozen").
  
  Return ONLY a JSON object where keys are the item indices (1 to ${items.length}) and values are the category names.
  
  Items:
  ${promptItems}`;
  
  try {
      const response = await base44.integrations.Core.InvokeLLM({
          prompt: prompt,
          response_json_schema: {
              type: "object",
              additionalProperties: { type: "string" }
          }
      });
      
      // Apply categories
      Object.entries(response).forEach(([idx, category]) => {
          const itemIndex = parseInt(idx) - 1;
          if (items[itemIndex]) {
              const item = items[itemIndex];
              if (item.data) {
                  item.data.category = category;
              } else {
                  item.category = category;
              }
          }
      });
      
  } catch (err) {
      console.error("Error categorizing items:", err);
      // Continue without categories
  }
}

// Helper to process in batches
async function processBatch(items, batchSize, delayMs, processFn, label) {
  const totalBatches = Math.ceil(items.length / batchSize);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    const remaining = items.length - (i + batch.length);
    
    console.log(`[${label}] Processing batch ${currentBatch}/${totalBatches} (${batch.length} items, ${remaining} remaining)`);
    
    try {
      await processFn(batch);
    } catch (err) {
      console.error(`[${label}] Batch ${currentBatch} failed:`, err);
    }
    
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
    let isAdmin = user.role === 'admin';
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
    let isNewChain = false;
    
    if (!chain) {
      // Search the web for chain information
      console.log(`Searching web for ${chainName} information...`);
      let chainInfo = {};
      try {
        const llmResponse = await base44.integrations.Core.InvokeLLM({
          prompt: `Find information about the Israeli supermarket chain "${chainName}". Provide: website URL, logo image URL, brief description, and chain type (supermarket, discount_store, premium_store, organic_store, kosher_store, or convenience_store).`,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              website_url: { type: "string" },
              logo_url: { type: "string" },
              description: { type: "string" },
              chain_type: { type: "string", enum: ["supermarket", "discount_store", "premium_store", "organic_store", "kosher_store", "convenience_store"] }
            }
          }
        });
        chainInfo = llmResponse;
        console.log("Found chain info:", chainInfo);
      } catch (error) {
        console.error("Failed to fetch chain info from web:", error);
      }
      
      chain = await svc.entities.Chain.create({
        name: chainName,
        external_chain_code: chainId,
        logo_url: chainInfo.logo_url || "",
        website_url: chainInfo.website_url || "",
        description: chainInfo.description || "",
        chain_type: chainInfo.chain_type || "supermarket"
      });
      isNewChain = true;
    } else {
      // Update chain name if provided
      await svc.entities.Chain.update(chain.id, {
        name: chainName
      });
      chain.name = chainName;
    }

    // Fetch store locations from OpenStreetMap if this is a new chain or no stores exist yet
    const existingStores = await svc.entities.Store.filter({ chain_id: chain.id });
    
    if (isNewChain || existingStores.length === 0) {
      console.log(`Fetching branch locations for ${chainName} from OpenStreetMap...`);
      try {
        // Search for chain branches in Israel
        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(chainName + ' Israel')}&format=json&countrycodes=il&limit=50&addressdetails=1`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'SmartCart-CatalogIngestion/1.0'
          }
        });
        
        if (response.ok) {
          const locations = await response.json();
          console.log(`Found ${locations.length} potential locations for ${chainName}`);
          
          // Create store records for each location
          const storesToCreate = [];
          for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            
            // Extract city from OSM address object
            let city = '';
            if (loc.address) {
              city = loc.address.city || loc.address.town || loc.address.village || loc.address.municipality || '';
            }
            
            storesToCreate.push({
              chain_id: chain.id,
              external_store_code: `OSM_${i + 1}`,
              name: chainName,
              address_line: loc.display_name,
              city: city,
              latitude: parseFloat(loc.lat),
              longitude: parseFloat(loc.lon),
              postal_code: loc.address?.postcode || ''
            });
          }
          
          if (storesToCreate.length > 0) {
            await svc.entities.Store.bulkCreate(storesToCreate);
            console.log(`Created ${storesToCreate.length} store locations from OpenStreetMap`);
          }
        }
      } catch (error) {
        console.error('Failed to fetch locations from OpenStreetMap:', error);
        // Continue without location data
      }
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
        name: chainName
      });
    } else {
      // Update store name if needed
      await svc.entities.Store.update(store.id, {
        name: chainName
      });
    }

    // Load existing products for this chain
    console.log("Loading existing products for this chain...");
    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });

    const productMap = new Map();
    for (const p of existingProducts) {
      productMap.set(p.gtin, p);
    }

    // Prepare bulk operations
    console.log("Preparing product data...");
    const newProducts = [];
    const updateProducts = [];

    for (const item of items) {
      const itemCode = item.ItemCode?.toString().trim();
      if (!itemCode) continue;

      const productData = {
        // Canonical fields
        gtin: itemCode,
        canonical_name: item.ItemName || "",
        brand_name: item.ManufacturerName || "",
        description: item.ManufacturerItemDescription || "",
        unit_of_measure: item.UnitOfMeasure || "",
        unit_quantity: parseFloat(item.UnitQty) || 0,
        package_quantity: parseFloat(item.QtyInPackage) || 0,
        is_weight_based: item.bIsWeighted === "1",
        
        // Price/Chain fields (Merged)
        chain_id: chain.id,
        store_id: null, // Chain-level price default
        current_price: parseFloat(item.ItemPrice) || 0,
        unit_price: parseFloat(item.UnitOfMeasurePrice) || 0,
        allow_discount: item.AllowDiscount === "1",
        price_updated_at: item.PriceUpdateDate || new Date().toISOString(),
        chain_item_code: itemCode,
        display_name: item.ItemName,
        availability_status: "in_stock"
      };

      let product = productMap.get(itemCode);
      if (!product) {
        newProducts.push(productData);
      } else {
        // Only categorize if missing
        if (!product.category) {
            productData._needsCategory = true;
        }
        updateProducts.push({ id: product.id, data: productData });
      }
      productMap.set(itemCode, product || { id: null, gtin: itemCode });
    }

    // Bulk create new products
    console.log(`Creating ${newProducts.length} new products...`);
    if (newProducts.length > 0) {
      await processBatch(
        newProducts,
        20, // Reduced batch size for LLM
        1000,
        async (batch) => {
            await categorizeItems(base44, batch);
            const created = await svc.entities.Product.bulkCreate(batch);
            for (const p of created) {
                productMap.set(p.gtin, p);
            }
        },
        "Product Creation"
      );
    }

    // Update existing products in batches with delay
    if (updateProducts.length > 0) {
      console.log(`Updating ${updateProducts.length} existing products in batches...`);
      await processBatch(
        updateProducts,
        20, // Reduced batch size for LLM
        2000, // delay 2 seconds between batches
        async (batch) => {
          // Filter items needing category
          const itemsToCategorize = batch.filter(item => item.data._needsCategory);
          if (itemsToCategorize.length > 0) {
            await categorizeItems(base44, itemsToCategorize);
          }
          
          for (const update of batch) {
            // Clean up internal flag
            const dataToUpdate = { ...update.data };
            delete dataToUpdate._needsCategory;
            
            await svc.entities.Product.update(update.id, dataToUpdate);
          }
        },
        "Product Updates"
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
      updatedProducts: updateProducts.length
    });

  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ 
      error: error.message || "Upload failed" 
    }, { status: 500 });
  }
});