import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates)) {
      return Response.json({ error: "updates array is required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    for (const update of updates) {
      await svc.entities.ProductPrice.update(update.productPriceId, {
        current_price: update.newPrice,
        price_updated_at: new Date().toISOString()
      });
    }

    return Response.json({ success: true, updatedCount: updates.length });

  } catch (error) {
    console.error("Update prices error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});