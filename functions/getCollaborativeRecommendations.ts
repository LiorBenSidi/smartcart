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
            console.log(`[CF] No user vectors found - trying profile-based collaborative filtering`);
            
            // Fall back to profile-based matching for new users
            const userProfile = await base44.entities.UserProfile.filter(
                { created_by: user.email }
            ).catch(() => []);
            
            if (userProfile.length === 0) {
                console.log(`[CF] No user profile found - cannot do CF`);
                return Response.json({ 
                    success: true, 
                    recommendations: [],
                    debug: { reason: "no_profile", message: "Complete onboarding first" }
                });
            }
            
            const profile = userProfile[0];
            console.log(`[CF] Using profile-based CF for new user: budget=${profile.budget_focus}, household=${profile.household_size}`);
            
            // Find similar users based on profile attributes
            const allProfiles = await base44.asServiceRole.entities.UserProfile.list('-created_date', 100).catch(() => []);
            
            // Score similarity based on profile attributes
            const similarProfiles = allProfiles
                .filter(p => p.created_by !== user.email) // Exclude self
                .map(p => {
                    let score = 0;
                    // Budget focus match
                    if (p.budget_focus === profile.budget_focus) score += 0.3;
                    // Household size similarity
                    const householdDiff = Math.abs((p.household_size || 1) - (profile.household_size || 1));
                    if (householdDiff === 0) score += 0.25;
                    else if (householdDiff === 1) score += 0.15;
                    // Kosher level match
                    const pKosher = p.kosher_level || p.kashrut_level || 'none';
                    const userKosher = profile.kosher_level || profile.kashrut_level || 'none';
                    if (pKosher === userKosher) score += 0.25;
                    // Diet match
                    if (p.diet === profile.diet) score += 0.2;
                    
                    return { ...p, similarity: score };
                })
                .filter(p => p.similarity > 0.3) // Minimum similarity threshold
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 10);
            
            console.log(`[CF] Found ${similarProfiles.length} similar profiles`);
            
            if (similarProfiles.length === 0) {
                return Response.json({ 
                    success: true, 
                    recommendations: [],
                    debug: { reason: "no_similar_profiles", message: "No similar user profiles found" }
                });
            }
            
            // Get habits from similar profile users
            const profileBasedSuggestions = [];
            for (const similarProfile of similarProfiles) {
                const neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                    { user_id: similarProfile.created_by },
                    '-purchase_count',
                    15
                ).catch(() => []);
                
                console.log(`[CF] Profile neighbor ${similarProfile.created_by}: ${neighborHabits.length} habits`);
                
                if (neighborHabits.length === 0) {
                    // Fall back to receipts
                    const receipts = await base44.asServiceRole.entities.Receipt.filter(
                        { created_by: similarProfile.created_by, processing_status: 'processed' },
                        '-purchased_at',
                        10
                    ).catch(() => []);
                    
                    const productCounts = {};
                    receipts.forEach(r => {
                        if (!r.items) return;
                        r.items.forEach(item => {
                            const pid = item.code || item.sku || item.product_id;
                            if (!pid) return;
                            if (!productCounts[pid]) {
                                productCounts[pid] = { product_id: pid, product_name: item.name, count: 0, total_qty: 0 };
                            }
                            productCounts[pid].count++;
                            productCounts[pid].total_qty += (item.quantity || 1);
                        });
                    });
                    
                    Object.values(productCounts)
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10)
                        .forEach(item => {
                            profileBasedSuggestions.push({
                                product_id: item.product_id,
                                product_name: item.product_name,
                                suggested_qty: Math.round(item.total_qty / item.count) || 1,
                                reason_type: "Collaborative",
                                confidence: 0.35 * similarProfile.similarity * Math.min(item.count / 5, 1),
                                evidence: {
                                    source: "profile_based_receipts",
                                    profile_similarity: similarProfile.similarity.toFixed(2)
                                }
                            });
                        });
                } else {
                    neighborHabits.forEach(habit => {
                        profileBasedSuggestions.push({
                            product_id: habit.product_id,
                            product_name: habit.product_name,
                            suggested_qty: Math.round(habit.avg_quantity) || 1,
                            reason_type: "Collaborative",
                            confidence: 0.45 * similarProfile.similarity * (habit.confidence_score || 0.5),
                            evidence: {
                                source: "profile_based_habits",
                                profile_similarity: similarProfile.similarity.toFixed(2)
                            }
                        });
                    });
                }
            }
            
            // Aggregate
            const aggregatedProfile = {};
            profileBasedSuggestions.forEach(item => {
                if (!aggregatedProfile[item.product_id]) {
                    aggregatedProfile[item.product_id] = { ...item, similar_users_count: 1 };
                } else {
                    aggregatedProfile[item.product_id].confidence = Math.min(0.85, aggregatedProfile[item.product_id].confidence + 0.08);
                    aggregatedProfile[item.product_id].similar_users_count++;
                }
            });
            
            const profileResults = Object.values(aggregatedProfile)
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 15);
            
            console.log(`[CF] Returning ${profileResults.length} profile-based recommendations`);
            return Response.json({ 
                success: true, 
                recommendations: profileResults,
                debug: { source: "profile_based_cf" }
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
            // Query by user_id field (the actual owner of the habit)
                const neighborHabits = await base44.asServiceRole.entities.UserProductHabit.filter(
                    { user_id: neighborId },
                    '-purchase_count',
                    15
                ).catch(() => []);
            
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