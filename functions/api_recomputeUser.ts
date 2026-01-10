import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Admin or Service Role only
        // base44.auth.me() checks user token.
        // If called via API key (service), me() might fail or return null?
        // Usually we check header for secret or rely on role.
        
        const user = await base44.auth.me().catch(() => null);
        
        // Simple Admin Check
        if (!user || user.role !== 'admin') {
             return Response.json({ error: "Forbidden: Admin only" }, { status: 403 });
        }

        const payload = await req.json().catch(() => ({}));
        const { user_id, scope } = payload;
        
        if (!user_id) return Response.json({ error: "user_id required" }, { status: 400 });

        const scopes = scope || [];
        
        if (scopes.includes('vectors')) {
            await base44.functions.invoke('buildUserVectors', { userId: user_id });
        }
        
        if (scopes.includes('neighbors')) {
            await base44.functions.invoke('computeSimilarUsers', { userId: user_id });
        }

        return Response.json({ status: "ok" });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});