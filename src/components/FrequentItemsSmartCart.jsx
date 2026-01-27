import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ChevronDown, ChevronUp, Plus, CheckCircle, Loader2 } from 'lucide-react';

export default function FrequentItemsSmartCart({ onAddToCartWithPrices, chains = [], userEmail = null }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [addedItems, setAddedItems] = useState(new Set());
    const [loadingPrices, setLoadingPrices] = useState(new Set());

    const getCacheKey = () => `frequent_items_${userEmail || 'anonymous'}`;

    useEffect(() => {
        const fetchFrequentItems = async () => {
            // Try loading from cache first
            const cacheKey = getCacheKey();
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setItems(parsed);
                    setLoading(false);
                    return;
                } catch (e) {
                    console.error("Failed to parse cached frequent items", e);
                }
            }

            try {
                const response = await base44.functions.invoke('generateDashboardInsights', {});
                if (response.data.success && response.data.rawData?.frequentItems) {
                    const frequentItems = response.data.rawData.frequentItems;
                    setItems(frequentItems);
                    // Save to cache per user
                    localStorage.setItem(cacheKey, JSON.stringify(frequentItems));
                }
            } catch (error) {
                console.error("Failed to fetch frequent items", error);
            } finally {
                setLoading(false);
            }
        };
        fetchFrequentItems();
    }, [userEmail]);

    const handleAddToCart = async (item) => {
        const itemKey = item.gtin || item.name;
        if (!itemKey) return;
        
        setLoadingPrices(prev => new Set([...prev, itemKey]));
        
        try {
            let allVariants = [];
            
            // Try GTIN first, fallback to name search
            if (item.gtin) {
                allVariants = await base44.entities.Product.filter({ gtin: item.gtin }, '-updated_date', 100);
            }
            
            // If no GTIN or no results, search by name with multiple strategies
            if (allVariants.length === 0 && item.name) {
                const allProducts = await base44.entities.Product.filter({}, '-updated_date', 1000);
                const searchName = item.name.toLowerCase().trim();
                const searchWords = searchName.split(/\s+/).filter(w => w.length > 2);
                
                // Strategy 1: Exact match
                allVariants = allProducts.filter(p => 
                    p.canonical_name?.toLowerCase() === searchName ||
                    p.display_name?.toLowerCase() === searchName
                );
                
                // Strategy 2: Contains full name
                if (allVariants.length === 0) {
                    allVariants = allProducts.filter(p => 
                        p.canonical_name?.toLowerCase().includes(searchName) ||
                        p.display_name?.toLowerCase().includes(searchName)
                    );
                }
                
                // Strategy 3: Match most words (at least 2 words must match)
                if (allVariants.length === 0 && searchWords.length >= 2) {
                    allVariants = allProducts.filter(p => {
                        const productName = (p.canonical_name || p.display_name || '').toLowerCase();
                        const matchCount = searchWords.filter(word => productName.includes(word)).length;
                        return matchCount >= Math.min(2, searchWords.length);
                    });
                }
            }
            
            const pricesByChain = {};
            
            allVariants.forEach(variant => {
                if (variant.chain_id && variant.current_price != null) {
                    // Only keep best (lowest) price per chain
                    if (!pricesByChain[variant.chain_id] || variant.current_price < pricesByChain[variant.chain_id].price) {
                        pricesByChain[variant.chain_id] = {
                            price: variant.current_price,
                            chain_id: variant.chain_id,
                            store_id: variant.store_id
                        };
                    }
                }
            });
            
            // Use found GTIN if available, otherwise use name as identifier
            const productGtin = item.gtin || allVariants[0]?.gtin || `name:${item.name}`;
            
            // Add to cart with prices
            onAddToCartWithPrices({ gtin: productGtin, canonical_name: item.name }, pricesByChain, false);
            
            // Visual feedback
            setAddedItems(prev => new Set([...prev, itemKey]));
            setTimeout(() => {
                setAddedItems(prev => {
                    const next = new Set(prev);
                    next.delete(itemKey);
                    return next;
                });
            }, 1500);
        } catch (error) {
            console.error("Failed to fetch prices for item", error);
        } finally {
            setLoadingPrices(prev => {
                const next = new Set(prev);
                next.delete(itemKey);
                return next;
            });
        }
    };

    if (loading) {
        return (
            <Card className="border-gray-700/50 bg-gray-800/30">
                <CardContent className="p-6 flex items-center justify-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading your frequent items...
                </CardContent>
            </Card>
        );
    }

    // Always show the component even if no items (collapsed state shows count)
    if (!items || items.length === 0) {
        return (
            <Card className="border-amber-500/30 bg-amber-900/10">
                <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2 text-amber-100">
                            <ShoppingBag className="w-5 h-5 text-amber-500" />
                            Most Purchased Items
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs ml-1">
                                0
                            </Badge>
                        </CardTitle>
                    </div>
                    <p className="text-xs text-amber-300/70 mt-1">Upload receipts to see your frequently purchased items here</p>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="border-amber-500/30 bg-amber-900/10">
            <CardHeader className="pb-2 pt-4 cursor-pointer select-none" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-amber-100">
                        <ShoppingBag className="w-5 h-5 text-amber-500" />
                        Most Purchased Items
                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs ml-1">
                            {items.length}
                        </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2 text-amber-400">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
                <p className="text-xs text-amber-300/70 mt-1">Items you buy frequently — add them to your cart with one tap</p>
            </CardHeader>
            
            {isOpen && (
                <CardContent className="pt-2 pb-4">
                    <div className="space-y-2">
                        {items.slice(0, 10).map((item, idx) => {
                            const itemKey = item.gtin || item.name;
                            const isAdded = addedItems.has(itemKey);
                            const isLoadingPrice = loadingPrices.has(itemKey);
                            
                            return (
                                <div 
                                    key={idx} 
                                    className="flex items-center justify-between p-3 bg-gray-800/50 dark:bg-gray-800/80 rounded-lg hover:bg-gray-800/70 transition-colors border border-gray-700/30"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-100 text-sm truncate" title={item.name}>
                                            {item.name}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            {item.category && (
                                                <Badge variant="outline" className="text-[10px] h-5 bg-gray-700/50 border-gray-600 text-gray-300">
                                                    {item.category}
                                                </Badge>
                                            )}
                                            <span className="text-xs text-gray-500">
                                                Bought {Math.round(item.count)}x
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                                        <div className="text-right">
                                            <div className="font-bold text-amber-400 text-sm">
                                                ₪{item.avgPrice?.toFixed(2) || (item.total / item.count)?.toFixed(2) || '—'}
                                            </div>
                                            <div className="text-[10px] text-gray-500">avg price</div>
                                        </div>
                                        
                                        <button
                                            type="button"
                                            disabled={isLoadingPrice}
                                            className={`h-8 w-8 p-0 rounded-md flex items-center justify-center transition-all duration-300 flex-shrink-0 relative z-10 disabled:opacity-50 disabled:cursor-not-allowed ${
                                                isAdded 
                                                    ? 'bg-green-500 hover:bg-green-600 scale-110' 
                                                    : 'bg-amber-600 hover:bg-amber-700'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddToCart(item);
                                            }}
                                            title="Add to cart"
                                        >
                                            {isLoadingPrice ? (
                                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                            ) : isAdded ? (
                                                <CheckCircle className="w-4 h-4 text-white" />
                                            ) : (
                                                <Plus className="w-4 h-4 text-white" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    
                    {items.length > 10 && (
                        <p className="text-xs text-gray-500 text-center mt-3">
                            Showing top 10 of {items.length} frequent items
                        </p>
                    )}
                </CardContent>
            )}
        </Card>
    );
}