import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Robust batch processor with fallback to individual items
async function processSafely(items, batchSize, delayMs, bulkFn, singleFn, onFail, label) {
  const totalBatches = Math.ceil(items.length / batchSize);
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;

    try {
      // Try bulk operation first
      await bulkFn(batch);
    } catch (err) {
      console.warn(`[${label}] Batch ${currentBatch}/${totalBatches} failed, falling back to individual processing: ${err.message}`);
      
      // Fallback to individual processing
      for (const item of batch) {
        try {
          await singleFn(item);
        } catch (singleErr) {
          console.error(`[${label}] Item failed: ${singleErr.message}`);
          if (onFail) onFail(item, singleErr);
        }
      }
    }

    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }
}

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
      if (!profiles.length || !profiles[0].is_admin) {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    const { jobId, limit = 1000 } = await req.json().catch(() => ({}));
    if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

    const svc = base44.asServiceRole;

    // 1. Fetch Pending Items
    const stagedBatch = await svc.entities.StagedCatalogItem.filter({
      job_id: jobId,
      status: 'pending'
    }, 'created_date', limit);

    if (stagedBatch.length === 0) {
      return Response.json({ processed: 0, hasMore: false });
    }

    // 2. Process Batch
    const productMap = new Map();
    const productsToUpdate = [];
    const productsToCreate = [];
    
    const pricesToUpdate = [];
    const pricesToCreate = [];

    // Track failures
    const failedGtins = new Map(); // GTIN -> Error Message

    // Pre-fetch existing products
    const gtins = stagedBatch.map(s => JSON.parse(s.item_json).ItemCode?.toString().trim()).filter(Boolean);
    
    let existingProducts = [];
    if (gtins.length > 0) {
        existingProducts = await svc.entities.Product.filter({ gtin: { $in: gtins } });
    }
    const existingProductMap = new Map(existingProducts.map(p => [p.gtin, p]));
    
    // Check existing prices
    const chainId = stagedBatch[0].chain_id; 
    let existingPrices = [];
    if (gtins.length > 0) {
        existingPrices = await svc.entities.ProductPrice.filter({ 
            chain_id: chainId,
            store_id: null,
            gtin: { $in: gtins }
        });
    }
    const existingPriceMap = new Map(existingPrices.map(p => [p.gtin, p]));

    for (const staged of stagedBatch) {
        let item;
        try {
            item = JSON.parse(staged.item_json);
        } catch (e) {
            // If JSON parse fails, mark this specific item as failed immediately
            failedGtins.set(`STAGED_ID_${staged.id}`, "Invalid JSON in staged item");
            continue;
        }

        const itemCode = item.ItemCode?.toString().trim();
        if (!itemCode) continue;

        // Product Logic
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

        if (existingProductMap.has(itemCode)) {
            const p = existingProductMap.get(itemCode);
            productsToUpdate.push({ id: p.id, data: productData });
        } else {
            if (!productsToCreate.find(p => p.gtin === itemCode)) {
                productsToCreate.push(productData);
            }
        }

        // Price Logic
        const priceData = {
            gtin: itemCode,
            chain_id: staged.chain_id,
            store_id: null,
            current_price: parseFloat(item.ItemPrice) || 0,
            unit_price: parseFloat(item.UnitOfMeasurePrice) || 0,
            allow_discount: item.AllowDiscount === "1",
            price_updated_at: item.PriceUpdateDate || new Date().toISOString()
        };

        if (existingPriceMap.has(itemCode)) {
            const p = existingPriceMap.get(itemCode);
            pricesToUpdate.push({ id: p.id, data: priceData });
        } else {
             if (!pricesToCreate.find(p => p.gtin === itemCode)) {
                pricesToCreate.push(priceData);
             }
        }
    }

    // Helper to capture failures
    const handleFailure = (item, err) => {
        // item is either productData or priceData or {id, data}
        const gtin = item.gtin || item.data?.gtin;
        if (gtin) {
            failedGtins.set(gtin, err.message);
        }
    };

    // Execute Bulk Ops with robust fallback
    
    // Create Products
    if (productsToCreate.length) {
      await processSafely(
        productsToCreate, 100, 200, 
        async (batch) => await svc.entities.Product.bulkCreate(batch),
        async (item) => await svc.entities.Product.create(item),
        handleFailure, 
        "Product Creation"
      );
    }

    // Create Prices
    if (pricesToCreate.length) {
      await processSafely(
        pricesToCreate, 100, 200, 
        async (batch) => await svc.entities.ProductPrice.bulkCreate(batch),
        async (item) => await svc.entities.ProductPrice.create(item),
        handleFailure, 
        "Price Creation"
      );
    }
    
    // Update Products
    if (productsToUpdate.length) {
      await processSafely(
        productsToUpdate, 50, 100, 
        async (batch) => await Promise.all(batch.map(p => svc.entities.Product.update(p.id, p.data))),
        async (item) => await svc.entities.Product.update(item.id, item.data),
        handleFailure, 
        "Product Update"
      );
    }

    // Update Prices
    if (pricesToUpdate.length) {
      await processSafely(
        pricesToUpdate, 50, 100, 
        async (batch) => await Promise.all(batch.map(p => svc.entities.ProductPrice.update(p.id, p.data))),
        async (item) => await svc.entities.ProductPrice.update(item.id, item.data),
        handleFailure, 
        "Price Update"
      );
    }

    // 3. Update Staged Items Status (Success or Failed)
    // We group by status to do efficient updates
    const successIds = [];
    const failedUpdates = []; // { id, message }

    for (const staged of stagedBatch) {
        let gtin;
        try {
             gtin = JSON.parse(staged.item_json).ItemCode?.toString().trim();
        } catch {
             // Already handled above
        }
        
        const isJsonFail = failedGtins.has(`STAGED_ID_${staged.id}`);
        const isGtinFail = gtin && failedGtins.has(gtin);

        if (isJsonFail || isGtinFail) {
            const msg = failedGtins.get(gtin) || failedGtins.get(`STAGED_ID_${staged.id}`);
            failedUpdates.push({ id: staged.id, message: msg });
        } else {
            successIds.push(staged.id);
        }
    }

    // Mark successful ones
    if (successIds.length) {
        await processSafely(
            successIds, 50, 50,
            async (batch) => await Promise.all(batch.map(id => svc.entities.StagedCatalogItem.update(id, { status: 'processed' }))),
            async (id) => await svc.entities.StagedCatalogItem.update(id, { status: 'processed' }),
            null, 
            "Status Update: Success"
        );
    }

    // Mark failed ones
    if (failedUpdates.length) {
        await processSafely(
            failedUpdates, 50, 50,
            async (batch) => await Promise.all(batch.map(f => svc.entities.StagedCatalogItem.update(f.id, { status: 'failed', error_message: f.message }))),
            async (f) => await svc.entities.StagedCatalogItem.update(f.id, { status: 'failed', error_message: f.message }),
            null,
            "Status Update: Failed"
        );
    }

    // Check remaining
    const remaining = await svc.entities.StagedCatalogItem.filter({ job_id: jobId, status: 'pending' });
    
    return Response.json({
      processed: stagedBatch.length,
      successCount: successIds.length,
      failureCount: failedUpdates.length,
      hasMore: remaining.length > 0,
      remaining: remaining.length
    });

  } catch (error) {
    console.error("Batch Process Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});