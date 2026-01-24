import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }

        const svc = base44.asServiceRole;

        // Fetch products in smaller batches to avoid memory issues
        let allProducts = [];
        let skip = 0;
        const batchSize = 1000;
        
        while (true) {
            const batch = await svc.entities.Product.filter({}, '-updated_date', batchSize, skip);
            if (!batch || batch.length === 0) break;
            allProducts = allProducts.concat(batch);
            console.log(`[generateBenchmarks] Fetched batch ${skip / batchSize + 1}, got ${batch.length} products, total: ${allProducts.length}`);
            if (batch.length < batchSize) break;
            skip += batchSize;
            // Safety limit
            if (allProducts.length > 50000) break;
        }

        console.log(`[generateBenchmarks] Total products fetched: ${allProducts.length}`);
        
        if (!allProducts || allProducts.length === 0) {
            return Response.json({ success: false, error: "No products found" });
        }

        // Log sample to debug structure
        if (allProducts.length > 0) {
            const sample = allProducts[0];
            console.log(`[generateBenchmarks] Sample product: gtin=${sample.gtin}, current_price=${sample.current_price}`);
        }

        // Group products by GTIN to calculate min/avg prices
        const pricesByGtin = new Map();
        
        for (const product of allProducts) {
            const gtin = product.gtin;
            const price = product.current_price;
            
            if (!gtin || price === undefined || price === null || price === 0) continue;
            
            if (!pricesByGtin.has(gtin)) {
                pricesByGtin.set(gtin, []);
            }
            pricesByGtin.get(gtin).push(price);
        }

        console.log(`[generateBenchmarks] Found ${pricesByGtin.size} unique GTINs with prices`);

        if (pricesByGtin.size === 0) {
            return Response.json({ success: false, error: "No products with prices found" });
        }

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