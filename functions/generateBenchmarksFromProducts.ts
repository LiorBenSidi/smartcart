import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        const { skip = 0, limit = 500 } = await req.json().catch(() => ({}));
        const svc = base44.asServiceRole;

        // Fetch one batch of products
        const products = await svc.entities.Product.filter({}, '-updated_date', limit, skip);
        
        if (!products || products.length === 0) {
            return Response.json({ 
                success: true, 
                done: true,
                message: "No more products to process",
                processedInBatch: 0,
                nextSkip: skip
            });
        }

        console.log(`[generateBenchmarks] Processing batch: skip=${skip}, got ${products.length} products`);

        // Group products by GTIN to calculate min/avg prices
        const pricesByGtin = new Map();
        
        for (const product of products) {
            const gtin = product.gtin;
            const price = product.current_price;
            
            if (!gtin || price === undefined || price === null || price === 0) continue;
            
            if (!pricesByGtin.has(gtin)) {
                pricesByGtin.set(gtin, []);
            }
            pricesByGtin.get(gtin).push(price);
        }

        console.log(`[generateBenchmarks] Found ${pricesByGtin.size} unique GTINs with prices in this batch`);

        if (pricesByGtin.size === 0) {
            return Response.json({ 
                success: true, 
                done: products.length < limit,
                processedInBatch: 0,
                nextSkip: skip + products.length
            });
        }

        // Create benchmarks for this batch
        const today = new Date().toISOString().split('T')[0];
        const benchmarks = [];

        for (const [gtin, prices] of pricesByGtin) {
            const minPrice = Math.min(...prices);
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

            benchmarks.push({
                product_id: gtin,
                date: today,
                min_price: minPrice,
                avg_price: avgPrice,
                source: "product_catalog",
                updated_at: new Date().toISOString()
            });
        }

        // Check for existing benchmarks for these GTINs today and skip them
        const existingBenchmarks = await svc.entities.BenchmarkPrice.filter({ date: today }, '', 5000);
        const existingProductIds = new Set(existingBenchmarks.map(b => b.product_id));
        
        // Filter out benchmarks that already exist
        const newBenchmarks = benchmarks.filter(b => !existingProductIds.has(b.product_id));
        
        console.log(`[generateBenchmarks] Skipping ${benchmarks.length - newBenchmarks.length} existing benchmarks`);
        
        benchmarks = newBenchmarks;

        // Bulk create benchmarks
        if (benchmarks.length > 0) {
            await svc.entities.BenchmarkPrice.bulkCreate(benchmarks);
        }

        console.log(`[generateBenchmarks] Created ${benchmarks.length} benchmarks`);

        const done = products.length < limit;

        return Response.json({
            success: true,
            done,
            processedInBatch: products.length,
            benchmarksCreated: benchmarks.length,
            nextSkip: skip + products.length
        });

    } catch (error) {
        console.error("Benchmark generation failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});