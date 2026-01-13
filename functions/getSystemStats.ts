import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Basic admin check
        if (!user || user.role !== 'admin') {
            const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
            if (!profiles.length || !profiles[0].is_admin) {
                 return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const svc = base44.asServiceRole;

        // Helper to count all items using pagination
        // Using filter({}) ensures we target all records
        const countAll = async (entityModel, entityName, batchSize = 1000) => {
            let total = 0;
            let page = 0;
            console.log(`Counting ${entityName}...`);
            
            while (true) {
                try {
                    // Use filter({}) which is often more robust for "all records" than list()
                    // filter(query, sort, limit, skip)
                    const items = await entityModel.filter({}, undefined, batchSize, page * batchSize);
                    
                    total += items.length;
                    console.log(`[${entityName}] Page ${page}: fetched ${items.length} items (Total: ${total})`);
                    
                    if (items.length < batchSize) break;
                    page++;
                    
                    if (page > 500) { // Safety break at 500 pages
                         console.log(`[${entityName}] Hit page limit safety break`);
                         break;
                    }
                } catch (err) {
                    console.error(`[${entityName}] Error fetching page ${page}:`, err);
                    break;
                }
            }
            return total;
        };

        // Run counts in parallel
        // Use smaller batch size for heavier entities like Receipt
        const [userCount, receiptCount, productCount, storeCount] = await Promise.all([
            countAll(svc.entities.User, "User", 2500),
            countAll(svc.entities.Receipt, "Receipt", 100), // Reduce batch size for Receipts as they are heavy
            countAll(svc.entities.Product, "Product", 2500),
            countAll(svc.entities.Store, "Store", 2500)
        ]);

        const result = {
            users: userCount,
            receipts: receiptCount,
            products: productCount,
            stores: storeCount
        };

        console.log("Stats result:", result);

        return Response.json(result);

    } catch (error) {
        console.error("Stats error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});