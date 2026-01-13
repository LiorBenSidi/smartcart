import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, TrendingDown, TrendingUp, Store as StoreIcon, Calendar, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Play, Pause } from 'lucide-react';
import { format } from 'date-fns';

const ProductSearchItem = ({ product, chains, onClick }) => {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchPrices = async () => {
      try {
        const priceList = await base44.entities.ProductPrice.filter({ gtin: product.gtin });
        if (!mounted) return;
        setPrices(priceList);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchPrices();
    return () => { mounted = false; };
  }, [product.gtin]);

  if (loading) {
      return (
        <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.canonical_name}</div>
                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
            </div>
        </div>
      );
  }

  if (prices.length === 0) {
      return null;
  }

  return (
    <>
      {prices.map((price) => {
          const chainName = chains.get(price.chain_id)?.name || 'Unknown Chain';
          return (
            <button
              key={price.id}
              onClick={() => onClick(product)}
              className="w-full text-left p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 transition-colors group"
            >
              <div className="flex justify-between items-center gap-4">
                  <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{product.canonical_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {product.brand_name && <span className="mr-3">{product.brand_name}</span>}
                        <span className="font-mono">{product.gtin}</span>
                      </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                      <div className="font-bold text-indigo-600 dark:text-indigo-400">
                          ₪{price.current_price?.toFixed(2)}
                      </div>
                      <Badge variant="outline" className="mt-1 text-[10px] px-1 h-5 font-normal bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
                          {chainName}
                      </Badge>
                  </div>
              </div>
            </button>
          );
      })}
    </>
  );
};

export default function PriceComparison() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [priceData, setPriceData] = useState([]);
  const [stores, setStores] = useState(new Map());
  const [chains, setChains] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const searchProducts = async () => {
      if (!searchTerm || searchTerm.length < 2) {
        if (searchTerm.length === 0) setProducts([]);
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
        }, undefined, 50);
        
        // Deduplicate by GTIN
        const uniqueProducts = [];
        const seenGtins = new Set();
        for (const p of results) {
            if (p.gtin && !seenGtins.has(p.gtin)) {
                seenGtins.add(p.gtin);
                uniqueProducts.push(p);
            }
        }
        
        setProducts(uniqueProducts);
      } catch (error) {
        console.error("Failed to search products", error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchProducts, 500);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  useEffect(() => {
    const loadData = async () => {
      const [allStores, allChains] = await Promise.all([
        base44.entities.Store.list(),
        base44.entities.Chain.list()
      ]);
      setStores(new Map(allStores.map(s => [s.id, s])));
      setChains(new Map(allChains.map(c => [c.id, c])));
    };
    loadData();
  }, []);

  const handleProductSelect = async (product) => {
    setSelectedProduct(product);
    setLoading(true);
    
    try {
      const prices = await base44.entities.ProductPrice.filter({ gtin: product.gtin });
      
      // Sort by price (cheapest first)
      prices.sort((a, b) => (a.current_price || 0) - (b.current_price || 0));
      
      setPriceData(prices);
    } catch (error) {
      console.error('Failed to load prices', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products;

  const cheapestPrice = priceData.length > 0 ? priceData[0].current_price : 0;
  const avgPrice = priceData.length > 0 
    ? priceData.reduce((sum, p) => sum + (p.current_price || 0), 0) / priceData.length 
    : 0;
  const maxPrice = priceData.length > 0 
    ? Math.max(...priceData.map(p => p.current_price || 0)) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800 text-white p-6 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Price Comparison</h1>
        <p className="text-indigo-100 text-sm">Compare prices across stores and find the best deals</p>
      </div>

      {/* Search */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search by product name, barcode, or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            />
          </div>
          
          {isSearching && (
              <div className="mt-4 flex items-center justify-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Searching products...
              </div>
          )}

          {!isSearching && searchTerm && filteredProducts.length === 0 && (
              <div className="mt-4 text-center text-gray-500 text-sm">
                  No products found. Try a different search term.
              </div>
          )}

          {!isSearching && filteredProducts.length > 0 && (
            <div className="mt-3 max-h-96 overflow-y-auto space-y-2">
              {filteredProducts.map((product) => (
                <ProductSearchItem 
                  key={product.id} 
                  product={product} 
                  chains={chains} 
                  onClick={(p) => {
                    handleProductSelect(p);
                    setSearchTerm('');
                    setProducts([]); 
                  }} 
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Product Info */}
      {selectedProduct && (
        <Card className="bg-white dark:bg-gray-800 border-2 border-indigo-100 dark:border-indigo-900">
          <CardHeader className="bg-indigo-50 dark:bg-indigo-900/30">
            <CardTitle className="text-lg flex items-center justify-between dark:text-gray-100">
              <div>
                <div>{selectedProduct.canonical_name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 font-normal mt-1">
                  {selectedProduct.brand_name} • {selectedProduct.gtin}
                </div>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Price Summary */}
      {selectedProduct && priceData.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4 text-center">
              <TrendingDown className="w-6 h-6 text-green-600 dark:text-green-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-600 dark:text-green-500">₪{cheapestPrice.toFixed(2)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Lowest Price</div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4 text-center">
              <div className="w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">₪{avgPrice.toFixed(2)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Average Price</div>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4 text-center">
              <TrendingUp className="w-6 h-6 text-red-600 dark:text-red-500 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-600 dark:text-red-500">₪{maxPrice.toFixed(2)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Highest Price</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Price Comparison List */}
      {loading && (
        <div className="text-center py-10 text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          Loading prices...
        </div>
      )}

      {selectedProduct && !loading && priceData.length === 0 && (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-10 text-center text-gray-500 dark:text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>No price data available for this product</p>
          </CardContent>
        </Card>
      )}

      {selectedProduct && !loading && priceData.length > 0 && (
        <div className="space-y-3">
          {priceData.map((price, index) => {
            const store = stores.get(price.store_id);
            const chain = chains.get(price.chain_id);
            const displayName = store?.name || chain?.name || 'Unknown Store';
            const isCheapest = index === 0;
            const priceDiff = price.current_price - cheapestPrice;
            const priceDeviation = avgPrice > 0 ? ((price.current_price - avgPrice) / avgPrice * 100) : 0;
            const hasPriceFluctuation = Math.abs(priceDeviation) > 15;

            return (
              <Card 
                key={price.id} 
                className={`${isCheapest ? 'border-2 border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-700' : 'border border-gray-200 dark:border-gray-700 dark:bg-gray-800'}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        isCheapest ? 'bg-green-500' : 'bg-gray-100 dark:bg-gray-700'
                      }`}>
                        <StoreIcon className={`w-6 h-6 ${isCheapest ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">{displayName}</h3>
                          {isCheapest && (
                            <Badge className="bg-green-600 dark:bg-green-700">Best Price</Badge>
                          )}
                          {hasPriceFluctuation && !isCheapest && (
                            <Badge variant="outline" className="text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {priceDeviation > 0 ? '+' : ''}{priceDeviation.toFixed(0)}% vs avg
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {price.price_updated_at 
                              ? format(new Date(price.price_updated_at), 'MMM d, yyyy') 
                              : 'No date'}
                          </span>
                          {price.unit_price > 0 && (
                            <span>Unit: ₪{price.unit_price.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-bold ${isCheapest ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        ₪{price.current_price.toFixed(2)}
                      </div>
                      {!isCheapest && priceDiff > 0 && (
                        <div className="text-xs text-red-600 dark:text-red-400 font-medium mt-1">
                          +₪{priceDiff.toFixed(2)} more
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!selectedProduct && (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-10 text-center text-gray-400 dark:text-gray-500">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p>Search for a product to compare prices across stores</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}