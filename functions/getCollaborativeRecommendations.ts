import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const collaborativeSuggestions = [];
        
        // Check for user vectors (stored by user_id field, not created_by)
        // Use asServiceRole to access all vectors regardless of who created them
        const userVectors = await base44.asServiceRole.entities.UserVectorSnapshot.filter(
            { user_id: user.email }, 
            '-computed_at', 
            1
        ).catch(() => []);
        console.log(`[CF] User ${user.email}: Found ${userVectors.length} vector snapshots`);

        if (userVectors.length === 0) {
            console.log(`[CF] No user vectors found - run "Rebuild User Vectors" first`);
            return Response.json({ 
                success: true, 
                recommendations: [],
                debug: { reason: "no_user_vectors", message: "Run 'Rebuild User Vectors' from Admin panel first" }
            });
        }

        // Get similar users (stored by user_id field, not created_by)
        // Use asServiceRole to access all edges
        const similarUsers = await base44.asServiceRole.entities.SimilarUserEdge.filter(
            { user_id: user.email },
            '-similarity',
            10
        ).catch(() => []);
        console.log(`[CF] Found ${similarUsers.length} similar users for ${user.email}`);

        if (similarUsers.length === 0) {
            console.log(`[CF] No similar users found - need more users with vectors`);
            return Response.json({ 
                success: true, 
                recommendations: [],
                debug: { reason: "no_similar_users", message: "No similar users found. Need more users with purchase history." }
            });
        }

        const neighborIds = similarUsers.map(su => su.neighbor_user_id);
        console.log(`[CF] Processing ${neighborIds.length} neighbors: ${neighborIds.join(', ')}`);

        // Get top products purchased by similar users
        for (const neighborId of neighborIds) {
            // First try UserProductHabit (created_by = neighborId)
            let neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                { created_by: neighborId },
                '-purchase_count',
                15
            ).catch(() => []);
            
            // If no habits, also try user_id field
            if (neighborHabits.length === 0) {
                neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                    { user_id: neighborId },
                    '-purchase_count',
                    15
                ).catch(() => []);
            }
            
            console.log(`[CF] Neighbor ${neighborId}: Found ${neighborHabits.length} habits`);

            // If still no habits, fall back to extracting from receipts directly
            if (neighborHabits.length === 0) {
                console.log(`[CF] No habits for ${neighborId}, falling back to receipts`);
                const receipts = await base44.asServiceRole.entities.Receipt.filter(
                    { created_by: neighborId, processing_status: 'processed' },
                    '-purchased_at',
                    10
                ).catch(() => []);
                
                // Extract product counts from receipts
                const productCounts = {};
                receipts.forEach(r => {
                    if (!r.items) return;
                    r.items.forEach(item => {
                        const pid = item.code || item.sku || item.product_id;
                        if (!pid) return;
                        if (!productCounts[pid]) {
                            productCounts[pid] = { 
                                product_id: pid, 
                                product_name: item.name, 
                                count: 0, 
                                total_qty: 0 
                            };
                        }
                        productCounts[pid].count++;
                        productCounts[pid].total_qty += (item.quantity || 1);
                    });
                });
                
                // Convert to habit-like objects, sorted by count
                const receiptBasedItems = Object.values(productCounts)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15);
                
                console.log(`[CF] Extracted ${receiptBasedItems.length} products from ${receipts.length} receipts for ${neighborId}`);
                
                receiptBasedItems.forEach(item => {
                    collaborativeSuggestions.push({
                        product_id: item.product_id,
                        product_name: item.product_name,
                        suggested_qty: Math.round(item.total_qty / item.count) || 1,
                        reason_type: "Collaborative",
                        confidence: 0.4 * Math.min(item.count / 5, 1), // Lower confidence for receipt-based
                        evidence: {
                            similar_users_count: 1,
                            source: "neighbor_receipts",
                            purchase_count: item.count
                        }
                    });
                });
            } else {
                neighborHabits.forEach(habit => {
                    collaborativeSuggestions.push({
                        product_id: habit.product_id,
                        product_name: habit.product_name,
                        suggested_qty: Math.round(habit.avg_quantity) || 1,
                        reason_type: "Collaborative",
                        confidence: 0.5 * (habit.confidence_score || 0.5), 
                        evidence: {
                            similar_users_count: 1,
                            source: "neighbor_habits"
                        }
                    });
                });
            }
        }

        // Aggregate by product_id to remove duplicates and boost confidence
        const aggregated = {};
        collaborativeSuggestions.forEach(item => {
            if (!aggregated[item.product_id]) {
                aggregated[item.product_id] = item;
            } else {
                // Boost confidence if recommended by multiple neighbors
                // Cap at 0.9
                const newConfidence = Math.min(0.9, aggregated[item.product_id].confidence + 0.1);
                aggregated[item.product_id].confidence = newConfidence;
                aggregated[item.product_id].evidence.similar_users_count = (aggregated[item.product_id].evidence.similar_users_count || 1) + 1;
            }
        });

        const results = Object.values(aggregated);
        console.log(`[CF] Returning ${results.length} aggregated recommendations`);
        return Response.json({ success: true, recommendations: results });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});