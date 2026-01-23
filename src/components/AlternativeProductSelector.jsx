import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Loader2, Check } from 'lucide-react';

export default function AlternativeProductSelector({ 
  itemName, 
  itemGtin,
  chainId,
  chainName,
  onSelect, 
  onClose 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chains, setChains] = useState([]);

  useEffect(() => {
    const loadChains = async () => {
      const chainsList = await base44.entities.Chain.list();
      setChains(chainsList);
    };
    loadChains();
  }, []);

  useEffect(() => {
    const searchProducts = async () => {
      setLoading(true);
      try {
        // Use item name words for initial search
        const query = searchTerm || itemName.split(' ').slice(0, 2).join(' ');
        
        const products = await base44.entities.Product.filter({
          canonical_name: { $regex: query, $options: 'i' },
          chain_id: chainId,
          gtin: { $ne: itemGtin }
        }, 'current_price', 50);

        // Count chains per GTIN
        const gtinChainCount = {};
        const gtinBestProduct = {};
        
        // For each product, we need to count how many chains have it
        const uniqueGtins = [...new Set(products.map(p => p.gtin))];
        
        // Fetch all products with these GTINs to count chains
        if (uniqueGtins.length > 0) {
          const allVariants = await base44.entities.Product.filter({
            gtin: { $in: uniqueGtins }
          }, '-updated_date', 500);
          
          allVariants.forEach(p => {
            if (!gtinChainCount[p.gtin]) {
              gtinChainCount[p.gtin] = new Set();
            }
            if (p.chain_id) {
              gtinChainCount[p.gtin].add(p.chain_id);
            }
          });
        }
        
        // Get best product per GTIN (from target chain)
        products.forEach(p => {
          if (!gtinBestProduct[p.gtin] || p.current_price < gtinBestProduct[p.gtin].current_price) {
            gtinBestProduct[p.gtin] = p;
          }
        });
        
        // Build final list with chain counts, sorted by chain count desc
        const finalResults = Object.values(gtinBestProduct)
          .map(p => ({
            ...p,
            chainCount: gtinChainCount[p.gtin]?.size || 1
          }))
          .sort((a, b) => b.chainCount - a.chainCount);
        
        setResults(finalResults);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, itemName, chainId, itemGtin]);

  return (
    <div className="absolute z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-3 w-80 max-h-96 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">Select alternative for <span className="text-yellow-400">{chainName}</span></span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            No products found
          </div>
        ) : (
          results.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="w-full text-left p-2 rounded hover:bg-gray-800 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-100 truncate group-hover:text-white">
                    {product.canonical_name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-green-400 font-semibold">
                      ₪{product.current_price?.toFixed(2)}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-gray-600 text-gray-400">
                      {product.chainCount} chains
                    </Badge>
                  </div>
                </div>
                <Check className="w-4 h-4 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}