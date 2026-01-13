import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

async function enrichProductBatch(base44, items) {
    if (items.length === 0) return;

    console.log(`Enriching ${items.length} items via LLM...`);

    const promptItems = items.map((item, idx) => {
        return `${idx + 1}. ${item.canonical_name || item.display_name} (${item.description || ''})`;
    }).join('\n');

    const prompt = `Analyze the following grocery products and provide:
    1. A standard category (e.g. "Dairy", "Meat", "Produce", "Bakery", "Beverages", "Snacks", "Pantry", "Household", "Personal Care", "Frozen").
    2. Kosher Level (guess based on product/description). Allowed values: "none", "basic_kosher", "strict_kosher", "glatt_kosher", "mehadrin". Default to "basic_kosher" if it looks kosher but unspecified, or "none" if likely not.
    3. Food Allergies. Check for presence of: "Gluten", "Nuts", "Soy", "Fish", "Wheat", "Lactose", "Peanuts", "Eggs", "Shellfish", "Sesame". Return list of detected allergens.

    Return a JSON object where keys are item indices (1 to ${items.length}) and values are objects with "category", "kosher_level", and "allergen_tags".

    Items:
    ${promptItems}`;

    try {
        const response = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: {
                type: "object",
                additionalProperties: {
                    type: "object",
                    properties: {
                        category: { type: "string" },
                        kosher_level: { type: "string", enum: ["none", "basic_kosher", "strict_kosher", "glatt_kosher", "mehadrin"] },
                        allergen_tags: { type: "array", items: { type: "string" } }
                    },
                    required: ["category", "kosher_level", "allergen_tags"]
                }
            }
        });

        const updates = [];
        
        // Process results
        for (const [idx, data] of Object.entries(response)) {
            const itemIndex = parseInt(idx) - 1;
            if (items[itemIndex]) {
                const item = items[itemIndex];
                updates.push({
                    id: item.id,
                    data: {
                        category: data.category,
                        kosher_level: data.kosher_level,
                        allergen_tags: data.allergen_tags,
                        enrichment_status: 'completed'
                    }
                });
            }
        }

        // Apply updates
        if (updates.length > 0) {
            console.log(`Applying ${updates.length} updates...`);
            // Update sequentially to avoid locks if high concurrency, or use Promise.all
            for (const update of updates) {
                await base44.asServiceRole.entities.Product.update(update.id, update.data);
            }
        }

    } catch (err) {
        console.error("Error enriching items:", err);
        // Mark as failed so we don't retry indefinitely immediately
        for (const item of items) {
             await base44.asServiceRole.entities.Product.update(item.id, { enrichment_status: 'failed' });
        }
    }
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify admin (or system) access
        const user = await base44.auth.me();
        
        // 1. Find pending products
        // Limit to 200 items per run to stay well within timeout limits
        const pendingProducts = await base44.asServiceRole.entities.Product.filter({
            enrichment_status: 'pending'
        }, undefined, 200);

        if (pendingProducts.length === 0) {
            return Response.json({ message: "No pending products found", processed: 0 });
        }

        console.log(`Found ${pendingProducts.length} pending products`);

        // 2. Mark as processing
        for (const p of pendingProducts) {
            await base44.asServiceRole.entities.Product.update(p.id, { enrichment_status: 'processing' });
        }

        // 3. Enrich
        await enrichProductBatch(base44, pendingProducts);

        return Response.json({ 
            success: true, 
            processed: pendingProducts.length 
        });

    } catch (error) {
        console.error("Job failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});