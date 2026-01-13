import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck, TrendingDown, Info } from 'lucide-react';
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
                // 1. Get Chains from DB
                const realChains = await base44.entities.Chain.list();
                setChains(realChains);
                if (realChains.length > 0) {
                    setSelectedChain(realChains[0].id);
                }

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
        <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                        <ShieldCheck className="w-5 h-5 text-green-600" />
                        AI-Curated Alternatives
                    </div>
                    <p className="text-sm text-gray-500 max-w-xl">
                        Filtered by your diet & preferences, ranked by savings.
                    </p>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <span className="text-sm font-medium whitespace-nowrap">Store:</span>
                    <Select value={selectedChain} onValueChange={setSelectedChain}>
                        <SelectTrigger className="w-full md:w-[200px] bg-white">
                            <SelectValue placeholder="Select Store" />
                        </SelectTrigger>
                        <SelectContent>
                            {chains.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

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
                <div className="grid gap-4">
                    {recommendations.map((rec, i) => (
                        <Card key={i} className="overflow-hidden border-indigo-50 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="bg-gray-50/50 pb-3 py-3">
                                <CardTitle className="flex justify-between items-center text-base">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">Base Item</span>
                                        <span>{rec.canonical_product.canonical_name || `Product ${rec.canonical_product.gtin}`}</span>
                                    </div>
                                    <Badge variant="outline" className="bg-white text-xs font-normal text-gray-500">
                                        Match Score: {rec.score?.toFixed(1) || 'N/A'}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-gray-100">
                                    {rec.alternatives.map((alt, j) => (
                                        <div key={j} className="p-3 pl-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="space-y-1">
                                                <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                                                    {j === 0 && <Sparkles className="w-3 h-3 text-amber-500" />}
                                                    {alt.name}
                                                </div>
                                                <div className="flex gap-2 text-xs">
                                                    {alt.tags?.map(t => (
                                                        <span key={t} className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 capitalize">{t.replace('_', ' ')}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <div className="font-bold text-sm">₪{alt.price}</div>
                                                    {parseFloat(alt.savings) > 0 && (
                                                        <div className="text-[10px] text-green-600 font-medium flex items-center justify-end gap-1">
                                                            <TrendingDown className="w-3 h-3" /> -₪{alt.savings}
                                                        </div>
                                                    )}
                                                </div>
                                                <Button size="sm" variant={j === 0 ? "default" : "outline"} className="h-8 text-xs">
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