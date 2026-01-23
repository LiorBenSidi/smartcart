import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { receiptId } = await req.json();
        if (!receiptId) {
            return Response.json({ error: "receiptId required" }, { status: 400 });
        }

        const receiptRes = await base44.entities.Receipt.filter({ id: receiptId });
        if (receiptRes.length === 0) {
             return Response.json({ error: "Receipt not found" }, { status: 404 });
        }
        const receipt = receiptRes[0];
        
        const svc = base44.asServiceRole;
        
        // Fetch benchmark prices
        const benchmarks = await svc.entities.BenchmarkPrice.list('-date', 1000); 
        const benchmarkMap = new Map();
        benchmarks.forEach(b => {
             if (!benchmarkMap.has(b.product_id)) {
                 benchmarkMap.set(b.product_id, b);
             }
        });

        // Pre-fetch products for "Swap" simulation (optimization)
        // We'll look for products in same categories as expensive items
        const allProducts = await svc.entities.Product.list() || [];
        const productsByCategory = new Map();
        if (Array.isArray(allProducts)) {
            allProducts.forEach(p => {
                if (!p.category) return;
                if (!productsByCategory.has(p.category)) productsByCategory.set(p.category, []);
                productsByCategory.get(p.category).push(p);
            });
        }

        const receiptItems = receipt.items || [];
        const insights = [];
        let totalOverpay = 0;
        let totalPotentialSavings = 0;

        // Process each item
        const itemBenchmarks = [];
        
        for (const item of receiptItems) {
            // Need to match item to a product GTIN.
            // If item has 'code' (sku), use it.
            if (!item.code && !item.sku) continue;
            
            const gtin = item.code || item.sku;
            const benchmark = benchmarkMap.get(gtin);
            
            if (benchmark) {
                const paidPrice = item.price || (item.unit_price_final); // handling varying field names
                if (!paidPrice) continue;

                // Check overpayment
                const minPrice = benchmark.min_price;
                const avgPrice = benchmark.avg_price;
                
                if (paidPrice > minPrice) {
                    const overpayPerUnit = paidPrice - minPrice;
                    const overpayTotal = overpayPerUnit * (item.quantity || 1);
                    const overpayPercent = ((paidPrice - minPrice) / minPrice) * 100;
                    
                    totalOverpay += overpayTotal;
                    totalPotentialSavings += overpayTotal;

                    itemBenchmarks.push({
                        receipt_line_item_id: item.code, // Ideally we have a unique ID for line item, but `code` works if unique in receipt or we just generate random ID
                        receipt_id: receipt.id,
                        benchmark_min_price: minPrice,
                        benchmark_avg_price: avgPrice,
                        paid_price: paidPrice,
                        overpay_amount: overpayTotal,
                        overpay_percent: overpayPercent,
                        created_at: new Date().toISOString()
                    });

                    // Add item insight if significant
                    if (overpayPercent > 20 && overpayTotal > 5) {
                        insights.push({
                            receipt_id: receipt.id,
                            type: "OVERPAY_ITEM",
                            message: `Overpaid for ${item.name}`,
                            explanation_text: `You paid ₪${paidPrice.toFixed(2)} but could have paid ₪${minPrice.toFixed(2)}. This is a ${overpayPercent.toFixed(0)}% markup.`,
                            potential_savings: overpayTotal,
                            confidence: 0.95,
                            evidence_json: JSON.stringify({
                                item: item.name,
                                paid: paidPrice,
                                benchmark: minPrice
                            })
                        });
                    }
                }
            }

            // --- What-if Simulation: Alternative Product Swap ---
            // If item is expensive (> 15 NIS), look for cheaper alternative in same category
            const itemPrice = item.price || item.unit_price_final;
            if (itemPrice > 15 && item.category && productsByCategory.has(item.category)) {
                const categoryProducts = productsByCategory.get(item.category);
                
                // Find potential swaps (different brand/product, cheaper benchmark price)
                let bestSwap = null;
                let maxSwapSavings = 0;

                for (const potentialProd of categoryProducts) {
                    // Skip same product
                    if (potentialProd.gtin === item.code) continue;
                    
                    const bench = benchmarkMap.get(potentialProd.gtin);
                    if (bench && bench.avg_price < itemPrice * 0.8) { // at least 20% cheaper
                        const saving = (itemPrice - bench.avg_price) * (item.quantity || 1);
                        if (saving > maxSwapSavings) {
                            maxSwapSavings = saving;
                            bestSwap = { product: potentialProd, price: bench.avg_price };
                        }
                    }
                }

                if (bestSwap && maxSwapSavings > 5) {
                     insights.push({
                        receipt_id: receipt.id,
                        type: "alternative", // Re-using 'alternative' or could use 'SWAP_OPPORTUNITY'
                        message: `Swap Opportunity: ${bestSwap.product.canonical_name}`,
                        explanation_text: `Switching from ${item.name} (₪${itemPrice}) to ${bestSwap.product.brand_name || ''} ${bestSwap.product.canonical_name} (avg ₪${bestSwap.price.toFixed(2)}) could have saved you ₪${maxSwapSavings.toFixed(2)}.`,
                        potential_savings: maxSwapSavings,
                        confidence: 0.8,
                        related_product_id: bestSwap.product.id,
                        evidence_json: JSON.stringify({
                            original: item.name,
                            swap: bestSwap.product.canonical_name,
                            savings: maxSwapSavings
                        })
                    });
                }
            }
        }

        // Store Item Benchmarks
        if (itemBenchmarks.length > 0) {
            await base44.entities.ReceiptItemBenchmark.bulkCreate(itemBenchmarks);
        }

        // Add Receipt Level Insights
        if (totalOverpay > 10) {
             insights.push({
                receipt_id: receipt.id,
                type: "OVERPAY_RECEIPT",
                message: `Potential savings of ₪${totalOverpay.toFixed(2)} found`,
                explanation_text: `Based on lowest market prices, you could have saved ₪${totalOverpay.toFixed(2)} on this shopping trip.`,
                potential_savings: totalOverpay,
                confidence: 0.9,
                evidence_json: JSON.stringify({ totalOverpay })
            });
        }

        // Save Insights
        if (insights.length > 0) {
            // Fetch existing insights to append? Or just overwrite?
            // The prompt says "Generate ReceiptInsights only for confirmed data".
            // We'll add them.
            await base44.entities.ReceiptInsight.bulkCreate(insights);
        }

        return Response.json({
            success: true,
            totalOverpay,
            insightsGenerated: insights.length
        });

    } catch (error) {
        console.error("Receipt economics analysis failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});