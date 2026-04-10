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
        const countAll = async (entityModel, batchSize = 1000) => {
            let total = 0;
            let page = 0;
            
            while (true) {
                const items = await entityModel.filter({}, undefined, batchSize, page * batchSize);
                total += items.length;
                
                if (items.length < batchSize) break;
                page++;
                if (page > 500) break; // Safety
            }
            return total;
        };

        // Run counts in parallel
        const [userCount, receiptCount, productCount, storeCount] = await Promise.all([
            countAll(svc.entities.User, 2500),
            countAll(svc.entities.Receipt, 100), // Smaller batch for heavy receipts
            countAll(svc.entities.Product, 2500),
            countAll(svc.entities.Store, 2500)
        ]);

        return Response.json({
            users: userCount,
            receipts: receiptCount,
            products: productCount,
            stores: storeCount
        });

    } catch (error) {
        console.error("Stats error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});