import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    
    // Assuming normalized input would be better, but we calculate full cosine here
    // If input is normalized, mag is 1.
    // Let's assume input is normalized from buildUserVectors
    
    // Dot product
    for (const key in vecA) {
        if (vecB[key]) {
            dot += vecA[key] * vecB[key];
        }
    }
    
    // Since we normalized in build step, dot product is the cosine similarity
    // But let's re-verify magnitude if needed. For now trust normalization.
    return dot;
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        const payload = await req.json().catch(() => ({}));
        const targetUserId = payload.userId || (user ? user.email : null);

        if (!targetUserId) {
            return Response.json({ error: "User ID required" }, { status: 400 });
        }

        // Fetch target user vectors
        const mySnapshots = await base44.entities.UserVectorSnapshot.filter({ user_id: targetUserId }, '-computed_at', 10);
        
        const myProfileVec = mySnapshots.find(s => s.vector_type === 'profile')?.vector_json || {};
        const myBehaviorVec = mySnapshots.find(s => s.vector_type === 'behavior')?.vector_json || {};
        
        // Determine Weights
        const receiptCount = Object.keys(myBehaviorVec).length; // Crude proxy for history depth
        const isColdStart = receiptCount < 3;
        
        const profileWeight = isColdStart ? 1.0 : 0.4;
        const behaviorWeight = isColdStart ? 0.0 : 0.6;
        
        // Fetch ALL other users' latest snapshots
        // Warning: This scales poorly. For prototype with < 100 users it's fine.
        // In real app, we'd use a vector DB or limit scan.
        const allSnapshots = await base44.entities.UserVectorSnapshot.list('-computed_at', 500); 
        
        // Group by user
        const userVectors = {};
        allSnapshots.forEach(s => {
            if (s.user_id === targetUserId) return;
            if (!userVectors[s.user_id]) userVectors[s.user_id] = {};
            // Take latest
            if (!userVectors[s.user_id][s.vector_type]) {
                userVectors[s.user_id][s.vector_type] = s.vector_json;
            }
        });

        const scores = [];

        for (const otherUserId in userVectors) {
            const otherProfile = userVectors[otherUserId]['profile'] || {};
            const otherBehavior = userVectors[otherUserId]['behavior'] || {};
            
            const profSim = cosineSimilarity(myProfileVec, otherProfile);
            const behSim = cosineSimilarity(myBehaviorVec, otherBehavior);
            
            const hybridSim = (profSim * profileWeight) + (behSim * behaviorWeight);
            
            scores.push({
                user_id: otherUserId,
                similarity: hybridSim,
                based_on: isColdStart ? 'profile' : 'hybrid'
            });
        }
        
        // Top K=30
        scores.sort((a, b) => b.similarity - a.similarity);
        const topK = scores.slice(0, 30);
        
        // Save Edges
        // First delete old edges? base44 doesn't support bulk delete easily by query without id list.
        // We'll just create new ones and filter by latest later.
        
        // Bulk create not available in all SDK versions, loop create
        const timestamp = new Date().toISOString();
        const promises = topK.map(edge => 
            base44.entities.SimilarUserEdge.create({
                user_id: targetUserId,
                neighbor_user_id: edge.user_id,
                similarity: edge.similarity,
                based_on: edge.based_on,
                computed_at: timestamp
            })
        );
        
        await Promise.all(promises);

        return Response.json({ success: true, count: topK.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});