import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json().catch(() => ({}));
        const { userId } = payload;

        if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

        // Count receipts for the user
        // Using filter to get all receipt IDs then counting length
        // In a real optimized scenario, we'd use a count() aggregate if available or maintain a counter
        // For this implementation, we'll fetch ID only to minimize data transfer if possible, 
        // but SDK list/filter returns full objects usually. 
        // We'll trust the query engine handles simple filters reasonably well for < 1000 items.
        
        const receipts = await base44.entities.Receipt.filter({ 
            created_by: userId 
        });

        const count = receipts.length;

        // Optionally update cache in UserProfileVector if it exists
        // We won't force create it here to keep concerns separated, but we can try to update if it exists.
        try {
            const vectors = await base44.entities.UserProfileVector.filter({ user_id: userId });
            if (vectors.length > 0) {
                await base44.entities.UserProfileVector.update(vectors[0].id, {
                    receipt_count_cached: count,
                    updated_at: new Date().toISOString()
                });
            }
        } catch (e) {
            // Ignore cache update errors
        }

        return Response.json({ count });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});