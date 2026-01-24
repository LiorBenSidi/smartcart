import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ChevronDown, ChevronUp, Plus, CheckCircle, Loader2 } from 'lucide-react';

export default function FrequentItemsSmartCart({ onAddToCartWithPrices, chains = [] }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [addedItems, setAddedItems] = useState(new Set());
    const [loadingPrices, setLoadingPrices] = useState(new Set());

    useEffect(() => {
        const fetchFrequentItems = async () => {
            try {
                const response = await base44.functions.invoke('generateDashboardInsights', {});
                if (response.data.success && response.data.rawData?.frequentItems) {
                    setItems(response.data.rawData.frequentItems);
                }
            } catch (error) {
                console.error("Failed to fetch frequent items", error);
            } finally {
                setLoading(false);
            }
        };
        fetchFrequentItems();
    }, []);

    const handleAddToCart = async (item) => {
        if (!item.gtin) return;
        
        setLoadingPrices(prev => new Set([...prev, item.gtin]));
        
        try {
            // Fetch all products with this GTIN to get prices from all chains
            const allVariants = await base44.entities.Product.filter({ gtin: item.gtin }, '-updated_date', 100);
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
            
            // Add to cart with prices
            onAddToCartWithPrices({ gtin: item.gtin, canonical_name: item.name }, pricesByChain, false);
            
            // Visual feedback
            setAddedItems(prev => new Set([...prev, item.gtin]));
            setTimeout(() => {
                setAddedItems(prev => {
                    const next = new Set(prev);
                    next.delete(item.gtin);
                    return next;
                });
            }, 1500);
        } catch (error) {
            console.error("Failed to fetch prices for item", error);
        } finally {
            setLoadingPrices(prev => {
                const next = new Set(prev);
                next.delete(item.gtin);
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

    if (!items || items.length === 0) {
        return null;
    }

    return (
        <Card className="border-amber-500/30 bg-amber-900/10 dark:bg-amber-900/10">
            <CardHeader className="pb-2 pt-4 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
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
                            const isAdded = addedItems.has(item.gtin);
                            const isLoadingPrice = loadingPrices.has(item.gtin);
                            
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
                                    
                                    <div className="flex items-center gap-3 ml-2">
                                        <div className="text-right">
                                            <div className="font-bold text-amber-400 text-sm">
                                                ₪{item.avgPrice?.toFixed(2) || (item.total / item.count)?.toFixed(2) || '—'}
                                            </div>
                                            <div className="text-[10px] text-gray-500">avg price</div>
                                        </div>
                                        
                                        <Button
                                            size="sm"
                                            disabled={!item.gtin || isLoadingPrice}
                                            className={`h-8 w-8 p-0 transition-all duration-300 ${
                                                isAdded 
                                                    ? 'bg-green-500 hover:bg-green-600 scale-110' 
                                                    : 'bg-amber-600 hover:bg-amber-700'
                                            }`}
                                            onClick={() => handleAddToCart(item)}
                                            title={item.gtin ? "Add to cart" : "No barcode available"}
                                        >
                                            {isLoadingPrice ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : isAdded ? (
                                                <CheckCircle className="w-4 h-4" />
                                            ) : (
                                                <Plus className="w-4 h-4" />
                                            )}
                                        </Button>
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