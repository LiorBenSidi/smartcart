import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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
    }, 'created_date', limit); // sort by created_date to be deterministic

    if (stagedBatch.length === 0) {
      return Response.json({ processed: 0, hasMore: false });
    }

    // 2. Process Batch
    const productMap = new Map();
    const productsToUpdate = [];
    const productsToCreate = [];
    
    const pricesToUpdate = [];
    const pricesToCreate = [];

    // Pre-fetch existing products to avoid duplicates? 
    // Optimization: Just filter by GTINs in this batch
    const gtins = stagedBatch.map(s => JSON.parse(s.item_json).ItemCode?.toString().trim()).filter(Boolean);
    
    // Check existing products
    // Note: filter with 'in' array might be limited in size. 
    // Doing a list() and map is expensive if DB is huge.
    // For now, let's fetch products matching these GTINs if possible or just list all (bad for scale).
    // Better: Iterate and find? No, N+1 queries.
    // Let's assume we can filter by GTIN list if small, or rely on upsert if available (not available).
    // We'll fetch all products? No.
    // We'll try to fetch existing products for this batch.
    // If we can't efficiently check existence, we might fail on uniqueness constraint or create dupes.
    // Assuming GTIN is unique field?
    
    // Workaround: We'll fetch all products just once? No memory limit.
    // Let's rely on `filter` accepting an array if supported, otherwise loop.
    // Base44 filter support for $in:
    // "gtin": { "$in": gtins }
    
    let existingProducts = [];
    if (gtins.length > 0) {
        // Chunk GTINs for query if needed, but 1000 might fit
        existingProducts = await svc.entities.Product.filter({ gtin: { $in: gtins } });
    }
    const existingProductMap = new Map(existingProducts.map(p => [p.gtin, p]));
    
    // Check existing prices (chain level)
    // We need chain_id. It's in the staged item.
    // Assuming all items in batch have same chain_id (likely if from same file/job).
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
        const item = JSON.parse(staged.item_json);
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
            // Deduplicate within batch
            if (!productsToCreate.find(p => p.gtin === itemCode)) {
                productsToCreate.push(productData);
            }
        }

        // Price Logic
        const priceData = {
            gtin: itemCode,
            chain_id: staged.chain_id,
            store_id: null, // Chain level
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

    // Execute Bulk Ops
    if (productsToCreate.length) await svc.entities.Product.bulkCreate(productsToCreate);
    if (pricesToCreate.length) await svc.entities.ProductPrice.bulkCreate(pricesToCreate);
    
    // Updates
    // Parallelize updates
    await Promise.all([
        ...productsToUpdate.map(p => svc.entities.Product.update(p.id, p.data)),
        ...pricesToUpdate.map(p => svc.entities.ProductPrice.update(p.id, p.data))
    ]);

    // 3. Mark Staged Items as Processed
    const stagedIds = stagedBatch.map(s => s.id);
    // Since we don't have bulkUpdate, we loop or use a backend function trick?
    // We'll loop update for now, or just delete them?
    // "Update status to 'processed'" is cleaner for history.
    // But bulk update isn't available in standard SDK except filter update? 
    // update_entities tool description says "Update multiple entities based on query filter".
    // SDK: base44.entities.Name.update(id, data) is single.
    // Does SDK have bulk update? Not explicitly shown in prompt.
    // We'll loop update.
    await Promise.all(stagedIds.map(id => svc.entities.StagedCatalogItem.update(id, { status: 'processed' })));

    // Check if more remain
    // We can just query count of pending
    const remaining = await svc.entities.StagedCatalogItem.filter({ job_id: jobId, status: 'pending' });
    
    return Response.json({
      processed: stagedBatch.length,
      hasMore: remaining.length > 0,
      remaining: remaining.length
    });

  } catch (error) {
    console.error("Batch Process Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});