import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        const svc = base44.asServiceRole;

        // Fetch all products with prices
        const products = await svc.entities.Product.list('-updated_date', 5000);
        
        if (!products || products.length === 0) {
            return Response.json({ success: false, error: "No products found" });
        }

        console.log(`[generateBenchmarks] Found ${products.length} products`);

        // Group products by GTIN to calculate min/avg prices
        const pricesByGtin = new Map();
        
        // Log first product to debug structure
        if (products.length > 0) {
            console.log("[generateBenchmarks] Sample product keys:", Object.keys(products[0]));
            console.log("[generateBenchmarks] Sample product:", JSON.stringify(products[0]).substring(0, 500));
        }
        
        for (const product of products) {
            // Try multiple ways to access the data
            const gtin = product.gtin ?? product.data?.gtin;
            const price = product.current_price ?? product.data?.current_price;
            
            if (!gtin || price === undefined || price === null) continue;
            
            if (!pricesByGtin.has(gtin)) {
                pricesByGtin.set(gtin, []);
            }
            pricesByGtin.get(gtin).push(price);
        }

        console.log(`[generateBenchmarks] Found ${pricesByGtin.size} unique GTINs with prices`);

        // Create benchmarks
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

        if (benchmarks.length === 0) {
            return Response.json({ success: false, error: "No products with prices found" });
        }

        // Delete existing benchmarks for today to avoid duplicates
        const existingBenchmarks = await svc.entities.BenchmarkPrice.filter({ date: today });
        console.log(`[generateBenchmarks] Deleting ${existingBenchmarks.length} existing benchmarks for today`);
        
        for (const b of existingBenchmarks) {
            await svc.entities.BenchmarkPrice.delete(b.id);
        }

        // Bulk create in chunks
        const chunkSize = 100;
        let created = 0;
        
        for (let i = 0; i < benchmarks.length; i += chunkSize) {
            const chunk = benchmarks.slice(i, i + chunkSize);
            await svc.entities.BenchmarkPrice.bulkCreate(chunk);
            created += chunk.length;
            console.log(`[generateBenchmarks] Created ${created}/${benchmarks.length} benchmarks`);
        }

        return Response.json({
            success: true,
            benchmarksCreated: created,
            uniqueProducts: pricesByGtin.size
        });

    } catch (error) {
        console.error("Benchmark generation failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});