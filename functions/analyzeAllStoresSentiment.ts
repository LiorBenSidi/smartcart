import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only function
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const svc = base44.asServiceRole;

    // Get all stores
    const stores = await svc.entities.Store.list();
    console.log(`Starting sentiment analysis for ${stores.length} stores`);

    const results = [];

    for (const store of stores) {
      try {
        const response = await base44.functions.invoke('analyzeStoreSentiment', {
          storeId: store.id
        });

        results.push({
          storeId: store.id,
          storeName: store.name,
          success: response.data.success,
          sentiment: response.data.sentiment
        });

        console.log(`✓ Analyzed ${store.name}`);
      } catch (error) {
        console.error(`✗ Failed to analyze ${store.name}:`, error.message);
        results.push({
          storeId: store.id,
          storeName: store.name,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Sentiment analysis complete: ${successCount}/${stores.length} stores analyzed`);

    return Response.json({ success: true, results, count: successCount });
  } catch (error) {
    console.error("Batch sentiment analysis error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});