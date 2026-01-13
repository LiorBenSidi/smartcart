import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            // Check secondary admin flag
            const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
            if (!profiles.length || !profiles[0].is_admin) {
                 return Response.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const svc = base44.asServiceRole;

        // Helper to count all items using pagination
        const countAll = async (entityModel) => {
            let total = 0;
            let page = 0;
            const limit = 2500; // Maximize batch size
            
            while (true) {
                // Fetch only ID to minimize data transfer if possible, though list returns full objects usually
                // list(sort, limit, skip)
                const items = await entityModel.list(undefined, limit, page * limit);
                total += items.length;
                
                if (items.length < limit) break;
                page++;
                
                // Safety break to prevent execution timeout for massive datasets
                if (page > 20) break; // Capped at 50k for this specific implementation
            }
            return total;
        };

        // Run counts in parallel
        const [userCount, receiptCount, productCount, storeCount] = await Promise.all([
            countAll(svc.entities.User),
            countAll(svc.entities.Receipt),
            countAll(svc.entities.Product),
            countAll(svc.entities.Store)
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