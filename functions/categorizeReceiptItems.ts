import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Fetch all products to get the list of categories and build a GTIN lookup
        const products = await base44.asServiceRole.entities.Product.list();
        const gtinToCategory = {};
        const categorySet = new Set();
        
        products.forEach(p => {
            if (p.gtin && p.category) {
                gtinToCategory[p.gtin] = p.category;
                categorySet.add(p.category);
            }
        });

        const categories = Array.from(categorySet).filter(Boolean);
        
        if (categories.length === 0) {
            return Response.json({ 
                error: 'No categories found in products',
                categorized: 0,
                llmCategorized: 0
            });
        }

        // Fetch all receipt items
        const receiptItems = await base44.asServiceRole.entities.ReceiptItem.list();
        
        let categorizedCount = 0;
        let llmCategorizedCount = 0;
        const updates = [];

        // Process items in batches for LLM
        const itemsNeedingLLM = [];
        
        for (const item of receiptItems) {
            if (item.category) {
                // Already categorized
                continue;
            }

            if (item.code && gtinToCategory[item.code]) {
                // Found category from product
                updates.push({
                    id: item.id,
                    category: gtinToCategory[item.code]
                });
                categorizedCount++;
            } else {
                // Need LLM categorization
                itemsNeedingLLM.push(item);
            }
        }

        // Batch LLM categorization (10 items at a time)
        const batchSize = 10;
        for (let i = 0; i < itemsNeedingLLM.length; i += batchSize) {
            const batch = itemsNeedingLLM.slice(i, i + batchSize);
            
            const prompt = `You are categorizing grocery receipt items. 
Available categories: ${categories.join(', ')}

Categorize each item into ONE of these categories. Return a JSON object with item names as keys and categories as values.

Items to categorize:
${batch.map((item, idx) => `${idx + 1}. ${item.name || item.raw_text}`).join('\n')}

Return ONLY a valid JSON object like: {"item1": "category", "item2": "category"}`;

            try {
                const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt,
                    response_json_schema: {
                        type: "object",
                        additionalProperties: { type: "string" }
                    }
                });

                // Map results back to items
                batch.forEach((item, idx) => {
                    const itemKey = `${idx + 1}. ${item.name || item.raw_text}`;
                    const matchedCategory = Object.entries(result).find(([key]) => 
                        key.includes(item.name || item.raw_text)
                    );
                    
                    if (matchedCategory && categories.includes(matchedCategory[1])) {
                        updates.push({
                            id: item.id,
                            category: matchedCategory[1]
                        });
                        llmCategorizedCount++;
                    }
                });
            } catch (error) {
                console.error(`Failed to categorize batch ${i}:`, error);
            }
        }

        // Apply all updates
        for (const update of updates) {
            await base44.asServiceRole.entities.ReceiptItem.update(update.id, {
                category: update.category
            });
        }

        return Response.json({
            success: true,
            totalItems: receiptItems.length,
            categorized: categorizedCount,
            llmCategorized: llmCategorizedCount,
            totalUpdated: updates.length,
            availableCategories: categories.length
        });

    } catch (error) {
        console.error('Categorization error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});