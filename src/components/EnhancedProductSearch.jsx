import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Plus, SlidersHorizontal, X, CheckCircle } from 'lucide-react';

export default function EnhancedProductSearch({ onAddToCart, onAddToCartWithPrices }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [addedItems, setAddedItems] = useState(new Set());
    
    // Filter states
    const [filters, setFilters] = useState({
        category: '',
        kosherLevel: '',
        dietary: '',
        priceMin: '',
        priceMax: '',
        chain: ''
    });
    
    // Sort state
    const [sortBy, setSortBy] = useState('relevance');
    
    // Stores and chains for display
    const [stores, setStores] = useState([]);
    const [chains, setChains] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [storesList, chainsList] = await Promise.all([
                    base44.entities.Store.list(),
                    base44.entities.Chain.list()
                ]);
                setStores(storesList);
                setChains(chainsList);
            } catch (error) {
                console.error("Failed to load data", error);
            }
        };
        loadData();
    }, []);

    // Apply filters and sorting
    const applyFiltersAndSort = (results) => {
        let filtered = results;

        // Apply filters
        if (filters.category) {
            filtered = filtered.filter(p => p.category?.toLowerCase().includes(filters.category.toLowerCase()));
        }
        if (filters.kosherLevel) {
            filtered = filtered.filter(p => p.kosher_level === filters.kosherLevel);
        }
        if (filters.dietary) {
            filtered = filtered.filter(p => {
                if (filters.dietary === 'vegan') return p.is_vegan;
                if (filters.dietary === 'gluten_free') return p.is_gluten_free;
                if (filters.dietary === 'kosher') return p.is_kosher;
                if (filters.dietary === 'organic') return p.is_organic;
                return true;
            });
        }
        if (filters.priceMin) {
            filtered = filtered.filter(p => p.current_price >= parseFloat(filters.priceMin));
        }
        if (filters.priceMax) {
            filtered = filtered.filter(p => p.current_price <= parseFloat(filters.priceMax));
        }
        if (filters.chain) {
            filtered = filtered.filter(p => p.chain_id === filters.chain);
        }

        // Apply sorting
        let sorted = [...filtered];
        if (sortBy === 'price_asc') {
            sorted.sort((a, b) => (a.current_price || 999999) - (b.current_price || 999999));
        } else if (sortBy === 'price_desc') {
            sorted.sort((a, b) => (b.current_price || 0) - (a.current_price || 0));
        } else if (sortBy === 'name_asc') {
            sorted.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
        } else if (sortBy === 'name_desc') {
            sorted.sort((a, b) => b.canonical_name.localeCompare(a.canonical_name));
        }

        return sorted;
    };

    // Search with regex matching
    useEffect(() => {
        const searchProducts = async () => {
            if (!searchTerm || searchTerm.length < 2) {
                setSearchResults([]);
                setSuggestions([]);
                return;
            }

            setIsSearching(true);
            try {
                const results = await base44.entities.Product.filter({
                    $or: [
                        { canonical_name: { $regex: searchTerm, $options: 'i' } },
                        { gtin: { $regex: searchTerm, $options: 'i' } },
                        { brand_name: { $regex: searchTerm, $options: 'i' } }
                    ]
                }, undefined, 200);
                
                // Count unique chains per GTIN
                const chainCountByGtin = {};
                const bestProductByGtin = {};
                results.forEach(product => {
                    if (!product.gtin) return;
                    if (!chainCountByGtin[product.gtin]) {
                        chainCountByGtin[product.gtin] = new Set();
                        bestProductByGtin[product.gtin] = product;
                    }
                    if (product.chain_id) {
                        chainCountByGtin[product.gtin].add(product.chain_id);
                    }
                    // Keep the product with lowest price as representative
                    if (product.current_price && (!bestProductByGtin[product.gtin].current_price || 
                        product.current_price < bestProductByGtin[product.gtin].current_price)) {
                        bestProductByGtin[product.gtin] = product;
                    }
                });
                
                // If no filters are chosen, prioritize by chain count then show best price per GTIN
                let finalResults = results;
                if (!hasActiveFilters) {
                    // Get unique products (one per GTIN), sorted by chain count desc, then price asc
                    const uniqueProducts = Object.entries(bestProductByGtin).map(([gtin, product]) => ({
                        ...product,
                        chainCount: chainCountByGtin[gtin]?.size || 0
                    }));
                    
                    uniqueProducts.sort((a, b) => {
                        // First by chain count (descending)
                        if (b.chainCount !== a.chainCount) return b.chainCount - a.chainCount;
                        // Then by price (ascending)
                        return (a.current_price || 999999) - (b.current_price || 999999);
                    });
                    
                    finalResults = uniqueProducts;
                } else {
                    // Apply filters and sorting
                    finalResults = applyFiltersAndSort(results);
                }
                
                // Show top 5 as suggestions
                setSuggestions(finalResults.slice(0, 5));
                
                // Show all results (limited to 50)
                setSearchResults(finalResults.slice(0, 50));
            } catch (error) {
                console.error("Failed to search products", error);
            } finally {
                setIsSearching(false);
            }
        };

        const debounce = setTimeout(searchProducts, 300);
        return () => clearTimeout(debounce);
    }, [searchTerm, filters, sortBy]);

    // Get unique categories for filter (async load when needed)
    const [categories, setCategories] = useState([]);
    
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const products = await base44.entities.Product.list('-updated_date', 500);
                const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
                setCategories(cats);
            } catch (error) {
                console.error("Failed to load categories", error);
            }
        };
        loadCategories();
    }, []);

    const clearFilters = () => {
        setFilters({
            category: '',
            kosherLevel: '',
            dietary: '',
            priceMin: '',
            priceMax: '',
            chain: ''
        });
    };

    const hasActiveFilters = Object.values(filters).some(v => v);

    const getSourceName = (product) => {
        const storeName = stores.find(s => s.id === product.store_id)?.name;
        const chainName = chains.find(c => c.id === product.chain_id)?.name;
        return storeName || chainName || 'Unknown';
    };

    const handleAddProduct = async (product) => {
        // Fetch all products with the same GTIN (from all chains)
        const allVariants = await base44.entities.Product.filter({
            gtin: product.gtin
        });
        
        // Build prices map by chain_id
        const pricesByChain = {};
        allVariants.forEach(variant => {
            if (variant.chain_id && variant.current_price) {
                pricesByChain[variant.chain_id] = {
                    price: variant.current_price,
                    chain_id: variant.chain_id,
                    store_id: variant.store_id
                };
            }
        });
        
        // If the new callback is provided, use it with prices
        if (onAddToCartWithPrices) {
            onAddToCartWithPrices(product, pricesByChain);
        } else {
            onAddToCart(product);
        }
        
        setSearchTerm('');
        setSearchResults([]);
        setSuggestions([]);
    };

    return (
        <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search products by name, barcode, brand, or category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                />
                {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
                )}
            </div>

            {/* Auto-suggestions dropdown */}
            {suggestions.length > 0 && searchTerm && searchResults.length === 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 space-y-1">
                    <div className="text-xs text-gray-500 px-2 py-1">Quick suggestions:</div>
                    {suggestions.map((product) => (
                        <button
                            key={product.id}
                            onClick={() => setSearchTerm(product.canonical_name)}
                            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                {product.canonical_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {product.brand_name && <span>{product.brand_name} • </span>}
                                {product.current_price && <span>₪{product.current_price.toFixed(2)}</span>}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Filter and Sort Controls */}
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={hasActiveFilters ? 'border-purple-500 text-purple-600' : ''}
                >
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    Filters
                    {hasActiveFilters && (
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                            {Object.values(filters).filter(v => v).length}
                        </Badge>
                    )}
                </Button>

                <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="price_asc">Price: Low to High</SelectItem>
                        <SelectItem value="price_desc">Price: High to Low</SelectItem>
                        <SelectItem value="name_asc">Name: A to Z</SelectItem>
                        <SelectItem value="name_desc">Name: Z to A</SelectItem>
                    </SelectContent>
                </Select>

                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="w-4 h-4 mr-1" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Category</label>
                            <Select value={filters.category} onValueChange={(v) => setFilters({...filters, category: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>All Categories</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Kosher Level</label>
                            <Select value={filters.kosherLevel} onValueChange={(v) => setFilters({...filters, kosherLevel: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Any</SelectItem>
                                    <SelectItem value="basic_kosher">Basic Kosher</SelectItem>
                                    <SelectItem value="strict_kosher">Strict Kosher</SelectItem>
                                    <SelectItem value="glatt_kosher">Glatt Kosher</SelectItem>
                                    <SelectItem value="mehadrin">Mehadrin</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Dietary</label>
                            <Select value={filters.dietary} onValueChange={(v) => setFilters({...filters, dietary: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Any</SelectItem>
                                    <SelectItem value="vegan">Vegan</SelectItem>
                                    <SelectItem value="gluten_free">Gluten Free</SelectItem>
                                    <SelectItem value="kosher">Kosher</SelectItem>
                                    <SelectItem value="organic">Organic</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Chain</label>
                            <Select value={filters.chain} onValueChange={(v) => setFilters({...filters, chain: v})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Chains" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>All Chains</SelectItem>
                                    {chains.map(chain => (
                                        <SelectItem key={chain.id} value={chain.id}>{chain.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Min Price (₪)</label>
                            <input
                                type="number"
                                placeholder="0"
                                value={filters.priceMin}
                                onChange={(e) => setFilters({...filters, priceMin: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm dark:bg-gray-900 dark:text-gray-100"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Max Price (₪)</label>
                            <input
                                type="number"
                                placeholder="999"
                                value={filters.priceMax}
                                onChange={(e) => setFilters({...filters, priceMax: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm dark:bg-gray-900 dark:text-gray-100"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Search Results */}
            {!isSearching && searchTerm && searchResults.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-4">
                    No products found matching your criteria.
                </div>
            )}

            {searchResults.length > 0 && (
                <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Found {searchResults.length} product{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {searchResults.map((product) => {
                            const sourceName = getSourceName(product);
                            
                            // Group by GTIN to show all variants
                            const minPriceForGtin = Math.min(
                                ...searchResults
                                    .filter(p => p.gtin === product.gtin && p.current_price)
                                    .map(p => p.current_price)
                            );
                            const isCheapest = product.current_price === minPriceForGtin;

                            return (
                                <div
                                    key={product.id}
                                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                                        isCheapest
                                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                                            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
                                    }`}
                                >
                                    <div className="flex-1 min-w-0 mr-3">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {product.canonical_name}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {product.brand_name && <span>{product.brand_name} • </span>}
                                            {product.gtin}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] px-1.5 py-0 h-5 font-normal bg-white dark:bg-gray-900 ${
                                                    isCheapest ? 'border-green-200 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'
                                                }`}
                                            >
                                                {sourceName}
                                            </Badge>
                                            {product.current_price && (
                                                <span className={`text-sm font-bold ${isCheapest ? 'text-green-700 dark:text-green-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                                    ₪{product.current_price.toFixed(2)}
                                                </span>
                                            )}
                                            {isCheapest && (
                                                <Badge className="text-[9px] px-1 py-0 h-4 bg-green-600 text-white border-0">
                                                    Best Price
                                                </Badge>
                                            )}
                                            {product.is_vegan && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Vegan</Badge>
                                            )}
                                            {product.is_kosher && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Kosher</Badge>
                                            )}
                                            {product.is_gluten_free && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">GF</Badge>
                                            )}
                                            {product.category && (
                                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                                                    {product.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className={`flex-shrink-0 h-8 w-8 p-0 transition-all duration-300 ${
                                            addedItems.has(product.id)
                                                ? 'bg-green-500 hover:bg-green-600 scale-110'
                                                : isCheapest ? 'bg-green-600 hover:bg-green-700' : ''
                                        }`}
                                        onClick={() => {
                                            handleAddProduct(product);
                                            setAddedItems(prev => new Set([...prev, product.id]));
                                            setTimeout(() => {
                                                setAddedItems(prev => {
                                                    const next = new Set(prev);
                                                    next.delete(product.id);
                                                    return next;
                                                });
                                            }, 1500);
                                        }}
                                    >
                                        {addedItems.has(product.id) ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}