import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to normalize vectors (L2 norm)
function normalizeVector(vec) {
    let sumSq = 0;
    for (const key in vec) {
        sumSq += vec[key] * vec[key];
    }
    const magnitude = Math.sqrt(sumSq);
    if (magnitude === 0) return vec;
    const normalized = {};
    for (const key in vec) {
        normalized[key] = vec[key] / magnitude;
    }
    return normalized;
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // This function might be called by a scheduler or manually. 
        // If manually, we usually build for the current user.
        // If no user context, we might need a userId in payload (admin/system).
        
        const payload = await req.json().catch(() => ({}));
        const targetUserId = payload.userId || (user ? user.email : null); // Using email as ID usually in base44 unless internal ID

        if (!targetUserId) {
            return Response.json({ error: "User ID required" }, { status: 400 });
        }

        // 1. Build Profile Vector
        const profiles = await base44.entities.UserProfile.filter({ created_by: targetUserId }); // Assuming created_by matches user email/id
        const profile = profiles[0];
        
        let profileVec = {};
        if (profile) {
            // Encode Kosher Level
            if (profile.kosher_level && profile.kosher_level !== 'none') {
                profileVec[`kosher_${profile.kosher_level}`] = 1.0;
            }
            // Encode Diet
            if (profile.diet && profile.diet !== 'none') {
                profileVec[`diet_${profile.diet}`] = 1.0;
            }
            // Encode Household Size (bucketed)
            const size = profile.household_size || 1;
            profileVec[`household_size`] = Math.min(size, 10) / 10.0; // Normalize 0-1
            
            // Encode Budget Focus
            const budgetMap = { "low": 0.0, "save_money": 0.0, "medium": 0.5, "balanced": 0.5, "high": 1.0, "health_focused": 0.8 };
            profileVec[`budget_score`] = budgetMap[profile.budget_focus] || 0.5;

            // Encode Allergies
            if (profile.allergies && Array.isArray(profile.allergies)) {
                profile.allergies.forEach(a => profileVec[`allergy_${a}`] = 1.0);
            }
        }
        
        profileVec = normalizeVector(profileVec);

        // Save Profile Vector
        // We can't update/upsert easily without ID, so we might create new or look for existing.
        // Ideally we'd filter by user_id and vector_type.
        // For simplicity in this prototype, we'll create a new snapshot or just not worry about cleanup for now (or delete old).
        await base44.entities.UserVectorSnapshot.create({
            user_id: targetUserId,
            vector_type: "profile",
            vector_json: profileVec,
            computed_at: new Date().toISOString()
        });


        // 2. Build Behavior Vector
        // Lookback all available history
        // const lookbackDate = new Date();
        // lookbackDate.setDate(lookbackDate.getDate() - 60);
        
        // Fetch receipt items
        // We need to fetch items where purchased_at > lookbackDate. 
        // Since purchased_at is on ReceiptItem now (as per our update), we can filter directly.
        // Assuming we can filter by date string.
        const items = await base44.entities.ReceiptItem.filter({ 
             // Ideally: purchased_at: { $gt: lookbackDate.toISOString() }, user_id/created_by logic
             // But filter syntax is limited in examples. We'll fetch recent.
             created_by: targetUserId
        }, '-purchased_at', 200); // Fetch last 200 items as approximation

        let behaviorVec = {};
        
        items.forEach(item => {
            const daysAgo = (new Date() - new Date(item.purchased_at || new Date())) / (1000 * 60 * 60 * 24);
            // if (daysAgo > 60) return; // Removed: now analyzing all available history
            
            const weight = Math.exp(-daysAgo / 14);
            
            // Category
            if (item.category) {
                behaviorVec[`cat_${item.category}`] = (behaviorVec[`cat_${item.category}`] || 0) + weight;
            }
            
            // Product
            if (item.product_id) { // Canonical product ID
                 behaviorVec[`prod_${item.product_id}`] = (behaviorVec[`prod_${item.product_id}`] || 0) + weight;
            }

            // Store Chain
            if (item.store_chain_id) {
                 behaviorVec[`chain_${item.store_chain_id}`] = (behaviorVec[`chain_${item.store_chain_id}`] || 0) + weight;
            }
        });

        behaviorVec = normalizeVector(behaviorVec);

        await base44.entities.UserVectorSnapshot.create({
            user_id: targetUserId,
            vector_type: "behavior",
            vector_json: behaviorVec,
            computed_at: new Date().toISOString()
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});