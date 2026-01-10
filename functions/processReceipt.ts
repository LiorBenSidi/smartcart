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

        // Define the prompt for extraction with confidence scoring
        const prompt = `
        Analyze this grocery receipt file (image or PDF) and extract the data into the following JSON format.
        Assign a confidence score (0.0 to 1.0) to every extracted field.
        
        - storeName: Name of the store
        - date: Date of purchase (YYYY-MM-DD).
        - time: Time of purchase (HH:MM).
        - address: Address of the store.
        - totalAmount: Total amount paid.
        - currency: Currency code (e.g. ILS, USD). Default to ILS if not found.
        - items: List of items purchased.
            - raw_text: The full line text from the receipt.
            - code: Product code/SKU if visible.
            - name: Product name.
            - category: Product category (Produce, Dairy, Meat, Snacks, etc).
            - quantity: Quantity.
            - price: Line total.
            - confidence_score: Overall confidence for this line item (0.0 to 1.0).

        Be conservative with confidence scores. If text is blurry or ambiguous, lower the score.
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