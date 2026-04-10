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
            return Response.json({ error: "receiptId is required" }, { status: 400 });
        }

        const receipts = await base44.entities.Receipt.filter({ id: receiptId });
        if (receipts.length === 0) {
            return Response.json({ error: "Receipt not found" }, { status: 404 });
        }
        const receipt = receipts[0];

        // const prompt = `
        // Analyze this grocery receipt file (image or PDF) and extract the data into the following JSON format.
        // Assign a confidence score (0.0 to 1.0) to every extracted field.
        
        // - storeName: Name of the store
        // - date: Date of purchase (YYYY-MM-DD).
        // - time: Time of purchase (HH:MM).
        // - address: Address of the store.
        // - totalAmount: Total amount paid.
        // - currency: Currency code (e.g. ILS, USD). Default to ILS if not found.
        // - items: List of items purchased.
        //     - raw_text: The full line text from the receipt.
        //     - code: Product code/SKU if visible.
        //     - name: Product name.
        //     - category: Product category (Produce, Dairy, Meat, Snacks, etc).
        //     - quantity: Quantity.
        //     - price: Line total.
        //     - confidence_score: Overall confidence for this line item (0.0 to 1.0).

        // Be conservative with confidence scores. If text is blurry or ambiguous, lower the score.
        // `;
        
        const prompt = `You are an expert AI assistant specialized in extracting structured data from grocery store receipts. Your task is to accurately parse the provided receipt image/PDF and convert its content into a precise JSON object.

                        Strictly adhere to the following guidelines:
                        1.  **Extract All Key Information**: Identify the store name, date of purchase (YYYY-MM-DD), time of purchase (HH:MM, 24-hour format), store address, total amount paid, and currency.
                        2.  **Item Details**: For each individual item listed on the receipt, extract its raw text, product code/SKU (if present), product name, quantity, and line total (price for that item).
                        3.  **Category Inference**: For each item, infer a general product category (e.g., "Produce", "Dairy", "Meat", "Snacks", "Beverages", "Household", "Pantry", "Frozen", "Bakery", "Personal Care", "Other"). If uncertain, use "Other".
                        4.  **Confidence Scores**: Assign a confidence score (between 0.0 and 1.0) to *every* extracted field (storeName, totalAmount, date) and to each individual line item. Be conservative; if text is blurry, unclear, or ambiguous, assign a lower confidence score.
                        5.  **Currency Default**: If the currency is not explicitly visible on the receipt, assume "ILS".
                        6.  **Missing Data**: If a specific field cannot be found on the receipt (e.g., time, address), return null for that field. Do NOT hallucinate.
                        7.  **JSON Format**: Your response MUST be a single, valid JSON object that strictly matches the provided schema, including all specified properties and their types.

                        Example Output Structure:
                        {
                          "storeName": "Example Supermarket",
                          "storeName_confidence": 0.98,
                          "date": "2026-01-15",
                          "date_confidence": 0.95,
                          "time": "14:30",
                          "address": "123 Main St, Anytown",
                          "totalAmount": 123.45,
                          "totalAmount_confidence": 0.99,
                          "currency": "ILS",
                          "items": [
                            {
                              "raw_text": "Milk 3% 1L",
                              "code": "7290000000000",
                              "name": "Milk 3% 1 Liter",
                              "category": "Dairy",
                              "quantity": 1,
                              "price": 7.50,
                              "confidence_score": 0.97
                            },
                            {
                              "raw_text": "Apples",
                              "code": null,
                              "name": "Apples",
                              "category": "Produce",
                              "quantity": 1.2,
                              "price": 10.80,
                              "confidence_score": 0.90
                            }
                          ]
                        }
                        `;

        const llmRes = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            file_urls: [receipt.raw_receipt_image_url],
            response_json_schema: {
                type: "object",
                properties: {
                    storeName: { type: "string" },
                    storeName_confidence: { type: "number" },
                    date: { type: "string" },
                    date_confidence: { type: "number" },
                    time: { type: "string" },
                    address: { type: "string" },
                    totalAmount: { type: "number" },
                    totalAmount_confidence: { type: "number" },
                    currency: { type: "string" },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                raw_text: { type: "string" },
                                code: { type: "string" },
                                name: { type: "string" },
                                category: { type: "string" },
                                quantity: { type: "number" },
                                price: { type: "number" },
                                confidence_score: { type: "number" }
                            }
                        }
                    }
                },
                required: ["storeName", "totalAmount", "date", "items"]
            }
        });

        // Heuristics and Validation Logic
        let needsReview = false;
        let needsMetadataReview = false;
        
        // Thresholds
        const METADATA_THRESHOLD = 0.9;
        const ITEM_THRESHOLD = 0.85;

        // 1. Validate Metadata
        if ((llmRes.storeName_confidence || 1) < METADATA_THRESHOLD || !llmRes.storeName) needsMetadataReview = true;
        if ((llmRes.totalAmount_confidence || 1) < METADATA_THRESHOLD || !llmRes.totalAmount) needsMetadataReview = true;
        if ((llmRes.date_confidence || 1) < METADATA_THRESHOLD || !llmRes.date) needsMetadataReview = true;
        
        // Metadata Fallback Heuristics (Regex for date if confidence is low)
        if (!llmRes.date || llmRes.date_confidence < 0.5) {
             // Simple fallback logic could go here, e.g. OCR text regex search
             // For now, we rely on the flag to force user review
             needsMetadataReview = true;
        }

        // 2. Validate Items
        const processedItems = (llmRes.items || []).map(item => {
            let itemNeedsReview = false;
            
            if ((item.confidence_score || 1) < ITEM_THRESHOLD) itemNeedsReview = true;
            if (!item.name || !item.price) itemNeedsReview = true;
            
            // Mark global review if any item needs review
            if (itemNeedsReview) needsReview = true;

            return {
                ...item,
                needs_review: itemNeedsReview,
                user_confirmed: false,
                // Map to ReceiptItem entity fields
                raw_text: item.raw_text || item.name,
                sku: item.code,
                line_total: item.price,
                description_on_receipt: item.name
            };
        });

        if (needsMetadataReview) needsReview = true;

        // Calculate average metadata confidence
        const metadataConfidence = (
            (llmRes.storeName_confidence || 1) + 
            (llmRes.totalAmount_confidence || 1) + 
            (llmRes.date_confidence || 1)
        ) / 3;

        // Construct Update Payload
        const updatePayload = {
            ...llmRes,
            items: processedItems,
            needs_review: needsReview,
            needs_metadata_review: needsMetadataReview,
            metadata_confidence: metadataConfidence,
            currency: llmRes.currency || 'ILS',
            processing_status: 'processed',
            // Map legacy fields
            total_amount: llmRes.totalAmount,
            storeName: llmRes.storeName,
            purchased_at: llmRes.date ? new Date(llmRes.date).toISOString() : new Date().toISOString()
        };

        // Update Receipt
        await base44.entities.Receipt.update(receipt.id, updatePayload);

        // Update User Product Habits
        try {
            for (const item of processedItems) {
                if (!item.name) continue;

                // Use SKU as product ID if available, otherwise name (fallback)
                // In a real app, we would match to CanonicalProduct first
                const productId = item.sku || item.name;

                // Check for existing habit
                const habits = await base44.entities.UserProductHabit.filter({
                    user_id: user.id,
                    product_id: productId
                });

                const now = new Date();
                const quantity = Number(item.quantity) || 1;

                if (habits.length > 0) {
                    const habit = habits[0];
                    const lastDate = new Date(habit.last_purchase_date);
                    const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

                    // Skip update if processed very recently (e.g. same receipt re-processed immediately)
                    // But allow if it's been at least an hour or so? 
                    // For now, we update every time to be safe, or maybe check distinct receipt?
                    // Ideally we track which receipts contributed to the habit.
                    // Simplified: just update.
                    
                    const newCount = (habit.purchase_count || 0) + 1;
                    const oldCadence = habit.avg_cadence_days || 0;
                    
                    // Update cadence only if there's a previous interval
                    let newCadence = oldCadence;
                    if (newCount > 1 && daysSince > 0) {
                         newCadence = newCount === 2 ? daysSince : 
                                      (oldCadence * (newCount - 2) + daysSince) / (newCount - 1);
                    }

                    const newAvgQty = ((habit.avg_quantity || 1) * (newCount - 1) + quantity) / newCount;

                    await base44.entities.UserProductHabit.update(habit.id, {
                        purchase_count: newCount,
                        last_purchase_date: now.toISOString(),
                        avg_cadence_days: newCadence,
                        avg_quantity: newAvgQty,
                        user_id: user.id, // Explicitly ensure user_id is set
                        last_calculated_at: now.toISOString()
                    });
                } else {
                    // Create new habit
                    await base44.entities.UserProductHabit.create({
                        user_id: user.id, // Explicitly set user_id
                        product_id: productId,
                        product_name: item.name,
                        purchase_count: 1,
                        last_purchase_date: now.toISOString(),
                        avg_cadence_days: 0,
                        avg_quantity: quantity,
                        confidence_score: item.confidence_score || 0.5,
                        last_calculated_at: now.toISOString()
                    });
                }
            }
        } catch (habitError) {
            console.error("Failed to update user habits:", habitError);
            // Don't fail the whole request if habit update fails
        }

        return Response.json({ 
            success: true, 
            needs_review: needsReview,
            data: updatePayload 
        });

    } catch (error) {
        console.error("Receipt processing failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});