import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
      if (!profiles[0]?.is_admin) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const { importId, limit = 1000, skip = 0 } = await req.json();

    const svc = base44.asServiceRole;

    // Fetch batch from TempCatalogItem
    const tempItems = await svc.entities.TempCatalogItem.filter(
        { import_id: importId }, 
        'created_date', // sort
        limit, 
        skip
    );

    if (tempItems.length === 0) {
        return Response.json({ processed: 0, hasMore: false });
    }

    const productPrices = tempItems.map(temp => {
        const item = temp.raw_data;
        const itemCode = item.ItemCode?.toString().trim();
        
        return {
            gtin: itemCode,
            chain_id: temp.chain_id,
            store_id: temp.store_id, // Store specific now? or chain level? "ProductPrice" usually specific if store is provided.
            // But usually chains update global prices unless it's a store file.
            // The XML has StoreId, so it is likely store-specific.
            // We'll keep store_id if present.
            
            chain_item_code: itemCode,
            
            // Integrated Product Info
            canonical_name: item.ItemName || "",
            display_name: item.ItemName || "",
            brand_name: item.ManufacturerName || "",
            description: item.ManufacturerItemDescription || "",
            unit_of_measure: item.UnitOfMeasure || "",
            unit_quantity: parseFloat(item.UnitQty) || 0,
            package_quantity: parseFloat(item.QtyInPackage) || 0,
            is_weight_based: item.bIsWeighted === "1",
            is_in_stock: true,
            
            // Price Info
            current_price: parseFloat(item.ItemPrice) || 0,
            unit_price: parseFloat(item.UnitOfMeasurePrice) || 0,
            allow_discount: item.AllowDiscount === "1",
            price_updated_at: item.PriceUpdateDate || new Date().toISOString(),
            availability_status: "in_stock"
        };
    });

    // Bulk Create ProductPrices (No dupe check as requested)
    await svc.entities.ProductPrice.bulkCreate(productPrices);

    return Response.json({ 
        processed: productPrices.length, 
        hasMore: productPrices.length === limit 
    });

  } catch (error) {
    console.error("Batch Process Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});