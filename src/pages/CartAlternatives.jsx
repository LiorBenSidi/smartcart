import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight, ShieldCheck, TrendingDown, Info } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function CartAlternatives() {
    const [loading, setLoading] = useState(true);
    const [runId, setRunId] = useState(null);
    const [chains, setChains] = useState([]);
    const [selectedChain, setSelectedChain] = useState("");
    const [recommendations, setRecommendations] = useState([]);
    const [materializing, setMaterializing] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                // 1. Get Chains (Mock or List)
                // Assuming we have Store Chains in DB or just use mocks for prototype
                // Let's list from Store entity and extract unique chains?
                // Or just hardcode a few common ones for the prototype.
                setChains([
                    { id: 'chain_1', name: 'SuperMart' },
                    { id: 'chain_2', name: 'MegaSave' },
                    { id: 'chain_3', name: 'OrganicLife' }
                ]);
                setSelectedChain('chain_1');

                // 2. Get/Generate Run
                const user = await base44.auth.me();
                const res = await base44.functions.invoke('api_createRecommendationRun', { 
                    user_id: user.email,
                    context: { k_items: 30 } // Minimal context for alternatives
                });
                if (res.data && res.data.run) {
                    setRunId(res.data.run.id);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (runId && selectedChain) {
            fetchMaterialized();
        }
    }, [runId, selectedChain]);

    const fetchMaterialized = async () => {
        setMaterializing(true);
        try {
            const res = await base44.functions.invoke('api_materializeRecommendationRun', {
                run_id: runId,
                store_chain_id: selectedChain,
                limits: { max_items: 15, max_alternatives_per_item: 3 }
            });
            
            // New API returns { results: [...] }
            if (res.data && res.data.results) {
                setRecommendations(res.data.results);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setMaterializing(false);
        }
    };

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in">
            <header className="space-y-4 border-b pb-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Smart Cart Alternatives</h1>
                <p className="text-gray-500 max-w-2xl">
                    We've filtered these products based on your diet, kosher level, and allergies, 
                    then ranked them by savings using real-time price data.
                </p>
                
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100 w-fit">
                    <ShieldCheck className="w-4 h-4" />
                    Filtered by your preferences & guardrails
                </div>

                <div className="flex items-center gap-4 mt-4">
                    <span className="text-sm font-medium">Choose Store Chain:</span>
                    <Select value={selectedChain} onValueChange={setSelectedChain}>
                        <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select Store" />
                        </SelectTrigger>
                        <SelectContent>
                            {chains.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </header>

            {materializing ? (
                <div className="py-20 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
                    <p className="text-gray-500">Checking prices and verifying ingredients...</p>
                </div>
            ) : recommendations.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl">
                    <Info className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No recommendations found matching your strict criteria for this store.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {recommendations.map((rec, i) => (
                        <Card key={i} className="overflow-hidden border-indigo-50 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="bg-gray-50/50 pb-3">
                                <CardTitle className="flex justify-between items-center text-lg">
                                    <span>{rec.canonical_product.canonical_name || `Product ${rec.canonical_product.gtin}`}</span>
                                    <Badge variant="outline" className="bg-white">
                                        Score: {rec.score?.toFixed(1) || 'N/A'}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-gray-100">
                                    {rec.alternatives.map((alt, j) => (
                                        <div key={j} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="space-y-1">
                                                <div className="font-medium text-gray-900">{alt.name}</div>
                                                <div className="flex gap-2 text-xs">
                                                    {alt.tags?.map(t => (
                                                        <span key={t} className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 capitalize">{t.replace('_', ' ')}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-bold text-lg">₪{alt.price}</div>
                                                {parseFloat(alt.savings) > 0 && (
                                                    <div className="text-xs text-green-600 font-medium flex items-center justify-end gap-1">
                                                        <TrendingDown className="w-3 h-3" /> Save ₪{alt.savings}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-4">
                                                 <Button size="sm" variant={j === 0 ? "default" : "outline"}>
                                                     Select
                                                 </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}