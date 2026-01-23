import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const CONFIG = {
    // Weekly
    MIN_WEEKDAY_OCCURRENCES_K: 3,
    MIN_WEEKLY_CONFIDENCE: 0.55,
    // Restock
    MIN_HABIT_CONFIDENCE: 0.6,
    DUE_THRESHOLD: 1.2,
    MIN_PURCHASE_COUNT_FOR_HABIT: 2,
    // Limits
    MAX_SUGGESTED_ITEMS_PER_DAY: 12,
    // Tier thresholds
    TIER_1_MAX_RECEIPTS: 9,   // 0-9 receipts: New users (CF-heavy)
    TIER_2_MAX_RECEIPTS: 19,  // 10-19 receipts: Developing users (balanced)
    // 20+ receipts: Established users (pattern-heavy)
};

// Tier configuration: { weeklyWeight, collaborativeWeight, minWeeklyConfidence, minHabitConfidence }
const TIER_CONFIG = {
    1: { weeklyWeight: 0.1, collaborativeWeight: 0.9, minWeeklyConfidence: 0.7, minHabitConfidence: 0.8, skipPatterns: true },
    2: { weeklyWeight: 0.5, collaborativeWeight: 0.5, minWeeklyConfidence: 0.5, minHabitConfidence: 0.55, skipPatterns: false },
    3: { weeklyWeight: 0.8, collaborativeWeight: 0.2, minWeeklyConfidence: 0.45, minHabitConfidence: 0.5, skipPatterns: false }
};

function getUserTier(receiptCount) {
    if (receiptCount <= CONFIG.TIER_1_MAX_RECEIPTS) return 1;
    if (receiptCount <= CONFIG.TIER_2_MAX_RECEIPTS) return 2;
    return 3;
}

function getMedian(values) {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return (values[half - 1] + values[half]) / 2.0;
}

// Helper to parse receipts into product purchases
function parseReceipts(receipts) {
    const productPurchases = {}; // productId -> list of {date, quantity}
    const productInfo = {}; // productId -> {name, category}

    receipts.forEach(r => {
        if (!r.items) return;
        const rDate = new Date(r.purchased_at || r.date);
        if (isNaN(rDate.getTime())) return;

        r.items.forEach(item => {
            const pid = item.code || item.sku || item.product_id;
            if (!pid) return;

            if (!productPurchases[pid]) {
                productPurchases[pid] = [];
                productInfo[pid] = { name: item.name, id: pid };
            }
            
            productPurchases[pid].push({
                date: rDate,
                quantity: item.quantity || 1
            });
        });
    });
    return { productPurchases, productInfo };
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { 
            batch = 0, 
            currentCartItems = []
        } = body;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const currentWeekday = today.getDay(); // 0 = Sunday

        // Fetch receipts once to determine user tier
        const allReceipts = await base44.entities.Receipt.filter({ 
            created_by: user.email, 
            processing_status: 'processed' 
        }, '-purchased_at', 200);
        const validReceipts = allReceipts.filter(r => r.purchased_at || r.date);
        const receiptCount = validReceipts.length;

        // Determine user tier and get config
        const userTier = getUserTier(receiptCount);
        const tierConfig = TIER_CONFIG[userTier];
        const weeklyWeight = tierConfig.weeklyWeight;
        const collaborativeWeight = tierConfig.collaborativeWeight;

        console.log(`User tier: ${userTier} (${receiptCount} receipts), weights: weekly=${weeklyWeight}, collab=${collaborativeWeight}`);

        // Get or Create Draft
        let draft;
        const existingDrafts = await base44.entities.SuggestedCartDraft.filter({ 
            created_by: user.email, 
            generated_date: todayStr 
        });

        if (existingDrafts.length > 0) {
            draft = existingDrafts[0];
            // If starting fresh (batch 0), clear items
            if (batch === 0) {
                 // But wait, if we are restarting, we should probably delete and recreate or update items to empty
                 // To be safe, let's update.
                 draft = await base44.entities.SuggestedCartDraft.update(draft.id, { 
                     items: [], 
                     status: 'draft', 
                     note: "Processing..." 
                 });
            }
        } else {
            draft = await base44.entities.SuggestedCartDraft.create({
                generated_date: todayStr,
                status: 'draft',
                items: [],
                note: "Processing..."
            });
        }

        // --- BATCH 0: WEEKLY PATTERNS ---
        if (batch === 0) {
            // For Tier 1 users, skip weekly patterns entirely
            if (tierConfig.skipPatterns) {
                return Response.json({ 
                    hasMore: true, 
                    progress: 25, 
                    message: `Tier ${userTier}: Skipping weekly patterns...`,
                    skipped: true,
                    userTier,
                    receiptCount
                });
            }

            const { productPurchases, productInfo } = parseReceipts(validReceipts);
            const weeklySuggestions = [];
            
            // Calculate distinct weeks
            const distinctWeeksForWeekday = new Set();
            validReceipts.forEach(r => {
                const rDate = new Date(r.purchased_at || r.date);
                if (isNaN(rDate.getTime())) return;
                if (rDate.getDay() === currentWeekday) {
                    const year = rDate.getFullYear();
                    // ISO week calculation approx
                    const date = new Date(rDate.getTime());
                    date.setHours(0, 0, 0, 0);
                    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
                    const week1 = new Date(date.getFullYear(), 0, 4);
                    const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
                    distinctWeeksForWeekday.add(`${year}-${weekNumber}`);
                }
            });
            const total_weeks = distinctWeeksForWeekday.size;

            for (const [pid, purchases] of Object.entries(productPurchases)) {
                purchases.sort((a, b) => b.date - a.date);

                let weekdayMatches = 0;
                const quantitiesOnWeekday = [];
                const datesOnWeekday = [];

                purchases.forEach(p => {
                    if (p.date.getDay() === currentWeekday) {
                        weekdayMatches++;
                        quantitiesOnWeekday.push(p.quantity);
                        datesOnWeekday.push(p.date.toISOString().split('T')[0]);
                    }
                });

                if (total_weeks > 0 && weekdayMatches >= CONFIG.MIN_WEEKDAY_OCCURRENCES_K) {
                    const confidence = weekdayMatches / total_weeks;
                    if (confidence >= tierConfig.minWeeklyConfidence) {
                        weeklySuggestions.push({
                            product_id: pid,
                            product_name: productInfo[pid].name,
                            suggested_qty: getMedian(quantitiesOnWeekday) || 1,
                            reason_type: "Weekly",
                            confidence: confidence,
                            evidence: {
                                weekday: currentWeekday,
                                occurrences: weekdayMatches,
                                n_weeks: total_weeks, // Rename to n_weeks for clarity in UI
                                total_weeks: total_weeks,
                                last_dates: datesOnWeekday.slice(0, 3)
                            }
                        });
                    }
                }
            }

            // Append to Draft
            await base44.entities.SuggestedCartDraft.update(draft.id, {
                items: [...draft.items, ...weeklySuggestions]
            });

            return Response.json({ 
                hasMore: true, 
                progress: 25, 
                message: "Analyzing weekly patterns..." 
            });
        }

        // --- BATCH 1: RESTOCK PATTERNS ---
        if (batch === 1) {
            // For Tier 1 users, skip restock patterns entirely
            if (tierConfig.skipPatterns) {
                return Response.json({ 
                    hasMore: true, 
                    progress: 50, 
                    message: `Tier ${userTier}: Skipping restock patterns...`,
                    skipped: true,
                    userTier,
                    receiptCount
                });
            }

            const { productPurchases, productInfo } = parseReceipts(validReceipts);
            
            const restockSuggestions = [];

            for (const [pid, purchases] of Object.entries(productPurchases)) {
                purchases.sort((a, b) => a.date - b.date); // Ascending for calc
                
                if (purchases.length < CONFIG.MIN_PURCHASE_COUNT_FOR_HABIT) continue;

                const intervals = [];
                for (let i = 1; i < purchases.length; i++) {
                    const diffTime = Math.abs(purchases[i].date - purchases[i-1].date);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) intervals.push(diffDays);
                }

                if (intervals.length === 0) continue;

                const avgCadence = intervals.reduce((a,b) => a+b, 0) / intervals.length;
                const avgQty = purchases.reduce((a,b) => a + b.quantity, 0) / purchases.length;
                const lastPurchase = purchases[purchases.length - 1].date;
                
                // Confidence
                const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgCadence, 2), 0) / intervals.length;
                const stdDev = Math.sqrt(variance);
                const cv = stdDev / (avgCadence || 1);
                let confidence = 1 / (1 + cv);
                if (confidence > 1) confidence = 1;

                if (confidence >= tierConfig.minHabitConfidence) {
                    const daysSinceLast = Math.floor((today - lastPurchase) / (1000 * 60 * 60 * 24));
                    const dueScore = daysSinceLast / (avgCadence || 1);

                    if (dueScore >= CONFIG.DUE_THRESHOLD) {
                        restockSuggestions.push({
                            product_id: pid,
                            product_name: productInfo[pid].name,
                            suggested_qty: Math.round(avgQty) || 1,
                            reason_type: "Restock",
                            confidence: confidence,
                            evidence: {
                                avg_cadence_days: avgCadence.toFixed(1),
                                days_since_last_purchase: daysSinceLast,
                                due_score: dueScore.toFixed(2),
                                purchase_count: purchases.length
                            },
                            due_score: dueScore
                        });
                    }
                }
            }

            // Append to Draft
            await base44.entities.SuggestedCartDraft.update(draft.id, {
                items: [...draft.items, ...restockSuggestions]
            });

            return Response.json({ 
                hasMore: true, 
                progress: 50, 
                message: "Checking restock needs..." 
            });
        }

        // --- BATCH 2: COLLABORATIVE ---
        if (batch === 2) {
            let collaborativeSuggestions = [];
            try {
                const collabRes = await base44.functions.invoke('getCollaborativeRecommendations', {});
                if (collabRes.data.success) {
                    collaborativeSuggestions = collabRes.data.recommendations || [];
                }
            } catch (e) {
                console.error("Collab failed", e);
            }

            // Append to Draft (mark as Collaborative)
            const labeledSuggestions = collaborativeSuggestions.map(s => ({
                ...s,
                reason_type: "Collaborative"
            }));

            await base44.entities.SuggestedCartDraft.update(draft.id, {
                items: [...draft.items, ...labeledSuggestions]
            });

            return Response.json({ 
                hasMore: true, 
                progress: 75, 
                message: "Analyzing similar users..." 
            });
        }

        // --- BATCH 3: FINALIZE ---
        if (batch === 3) {
            // Check if CF-only user
            const receipts = await base44.entities.Receipt.filter({ 
                created_by: user.email, 
                processing_status: 'processed' 
            }, '-purchased_at', 100);
            const validReceipts = receipts.filter(r => r.purchased_at || r.date);
            const isCFOnlyUser = validReceipts.length < CONFIG.CF_ONLY_RECEIPT_THRESHOLD;
            
            // Need user preferences to filter
            const userPreferences = await base44.entities.UserProductPreference.filter({ 
                created_by: user.email,
                preference: 'dislike'
            }).catch(() => []);
            const dislikedGTINs = new Set(userPreferences.map(p => p.product_gtin));

            // Filter out items already in CURRENT CART.
            const cartItemSet = new Set(currentCartItems);

            let allSuggestions = draft.items || [];
            
            // For CF-only users, ensure only collaborative suggestions are kept
            if (isCFOnlyUser) {
                allSuggestions = allSuggestions.filter(s => s.reason_type === "Collaborative");
            }
            
            const suggestionMap = new Map();

            // Merge Logic
            allSuggestions.forEach(s => {
                if (dislikedGTINs.has(s.product_id)) return;
                
                if (suggestionMap.has(s.product_id)) {
                    const existing = suggestionMap.get(s.product_id);
                    
                    // Priority Merge: Weekly+Restock > Hybrid
                    // If types differ, it becomes Hybrid or specific combo
                    if (existing.reason_type !== s.reason_type) {
                        if ((existing.reason_type === 'Weekly' && s.reason_type === 'Restock') || 
                            (existing.reason_type === 'Restock' && s.reason_type === 'Weekly')) {
                            existing.reason_type = "Weekly+Restock";
                        } else {
                            existing.reason_type = "Hybrid";
                        }
                    }
                    
                    // Blend Confidence
                    if (s.reason_type === 'Collaborative' || existing.reason_type === 'Collaborative' || existing.reason_type === 'Hybrid') {
                         const totalWeight = weeklyWeight + collaborativeWeight || 1;
                         existing.confidence = (existing.confidence * weeklyWeight + s.confidence * collaborativeWeight) / totalWeight;
                         existing.evidence = { 
                            ...existing.evidence, 
                            collaborative_evidence: s.reason_type === 'Collaborative' ? s.evidence : existing.evidence?.collaborative_evidence,
                            blending_weights: { weekly: weeklyWeight, collaborative: collaborativeWeight }
                         };
                    } else {
                        existing.confidence = Math.max(existing.confidence, s.confidence);
                        existing.evidence = { ...existing.evidence, ...s.evidence };
                    }
                    
                    existing.suggested_qty = Math.max(existing.suggested_qty, s.suggested_qty);
                } else {
                    suggestionMap.set(s.product_id, { ...s });
                }
            });

            let finalSuggestions = Array.from(suggestionMap.values());

            // Sorting
            finalSuggestions.sort((a, b) => {
                const priority = { 
                    "Weekly+Restock": 5, "Collaborative": 4, "Hybrid": 3, "Restock": 2, "Weekly": 1 
                };
                const pA = priority[a.reason_type] || 0;
                const pB = priority[b.reason_type] || 0;
                if (pA !== pB) return pB - pA;
                if (Math.abs(a.confidence - b.confidence) > 0.05) return b.confidence - a.confidence;
                return (b.evidence?.due_score || 0) - (a.evidence?.due_score || 0);
            });

            // Filter Cart Items & Limit
            const filteredSuggestions = [];
            const backfillPool = [];
            
            for (const suggestion of finalSuggestions) {
                if (!cartItemSet.has(suggestion.product_id)) {
                    if (filteredSuggestions.length < CONFIG.MAX_SUGGESTED_ITEMS_PER_DAY) {
                        filteredSuggestions.push(suggestion);
                    } else {
                        backfillPool.push(suggestion);
                    }
                }
            }
            while (filteredSuggestions.length < CONFIG.MAX_SUGGESTED_ITEMS_PER_DAY && backfillPool.length > 0) {
                filteredSuggestions.push(backfillPool.shift());
            }

            // Save Final
            const finalDraft = await base44.entities.SuggestedCartDraft.update(draft.id, {
                status: 'draft',
                items: filteredSuggestions,
                note: filteredSuggestions.length === 0 ? "No patterns found." : undefined
            });

            return Response.json({ 
                hasMore: false, 
                progress: 100, 
                message: "Done!",
                draft: finalDraft
            });
        }

        return Response.json({ hasMore: false });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});