import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function cosineSimilarity(vecA, vecB) {
    const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (const key of keys) {
        const a = vecA[key] || 0;
        const b = vecB[key] || 0;
        dotProduct += a * b;
        magA += a * a;
        magB += b * b;
    }
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: "Admin access required" }, { status: 403 });
        }
        
        const payload = await req.json().catch(() => ({}));
        const batch = payload.batch || 0;
        const limit = payload.limit || 5;
        const skip = batch * limit;
        
        // Get all users
        const allUsers = await base44.entities.User.list('', 500);
        const usersToProcess = allUsers.slice(skip, skip + limit);
        const hasMore = skip + limit < allUsers.length;
        
        console.log(`[SimilarUsers] Batch ${batch}: Processing ${usersToProcess.length} users (skip=${skip})`);
        
        if (usersToProcess.length === 0) {
            return Response.json({
                success: true,
                hasMore: false,
                results: [],
                message: "No more users to process"
            });
        }
        
        // Load ALL user vectors once (for comparing against)
        const allVectors = await base44.asServiceRole.entities.UserVectorSnapshot.filter({}, '-computed_at', 1000);
        console.log(`[SimilarUsers] Loaded ${allVectors.length} vector snapshots`);
        
        // Group vectors by user_id, keeping most recent of each type
        const vectorsByUser = {};
        for (const vec of allVectors) {
            if (!vectorsByUser[vec.user_id]) {
                vectorsByUser[vec.user_id] = {};
            }
            // Keep most recent (already sorted by -computed_at)
            if (!vectorsByUser[vec.user_id][vec.vector_type]) {
                vectorsByUser[vec.user_id][vec.vector_type] = vec.vector_json;
            }
        }
        
        const results = [];
        
        for (const targetUser of usersToProcess) {
            const userId = targetUser.email;
            const userVecs = vectorsByUser[userId];
            
            if (!userVecs || (!userVecs.profile && !userVecs.behavior)) {
                console.log(`[SimilarUsers] Skipping ${userId} - no vectors`);
                results.push({ userId, status: 'skipped', reason: 'no_vectors' });
                continue;
            }
            
            // Delete existing edges for this user
            const existingEdges = await base44.asServiceRole.entities.SimilarUserEdge.filter({ user_id: userId });
            for (const edge of existingEdges) {
                await base44.asServiceRole.entities.SimilarUserEdge.delete(edge.id);
            }
            
            // Compute similarity with all other users
            const similarities = [];
            
            for (const [otherUserId, otherVecs] of Object.entries(vectorsByUser)) {
                if (otherUserId === userId) continue;
                if (!otherVecs.profile && !otherVecs.behavior) continue;
                
                // Compute weighted similarity (profile + behavior)
                let totalSim = 0;
                let weights = 0;
                
                if (userVecs.profile && otherVecs.profile) {
                    totalSim += cosineSimilarity(userVecs.profile, otherVecs.profile) * 0.3;
                    weights += 0.3;
                }
                if (userVecs.behavior && otherVecs.behavior) {
                    totalSim += cosineSimilarity(userVecs.behavior, otherVecs.behavior) * 0.7;
                    weights += 0.7;
                }
                
                const similarity = weights > 0 ? totalSim / weights : 0;
                
                if (similarity >= 0.1) { // Minimum threshold
                    similarities.push({ neighborId: otherUserId, similarity });
                }
            }
            
            // Sort and keep top 10
            similarities.sort((a, b) => b.similarity - a.similarity);
            const topSimilar = similarities.slice(0, 10);
            
            console.log(`[SimilarUsers] ${userId}: Found ${topSimilar.length} similar users`);
            
            // Create edges
            for (const sim of topSimilar) {
                await base44.asServiceRole.entities.SimilarUserEdge.create({
                    user_id: userId,
                    neighbor_user_id: sim.neighborId,
                    similarity: sim.similarity,
                    based_on: "hybrid",
                    computed_at: new Date().toISOString()
                });
            }
            
            results.push({ 
                userId, 
                status: 'success', 
                similarUsersFound: topSimilar.length,
                topSimilarity: topSimilar[0]?.similarity || 0
            });
        }
        
        const progress = Math.min(100, Math.round(((skip + usersToProcess.length) / allUsers.length) * 100));
        
        return Response.json({
            success: true,
            hasMore,
            progress,
            results,
            message: `Processed ${usersToProcess.length} users, found similarities`
        });
        
    } catch (error) {
        console.error('[SimilarUsers] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});