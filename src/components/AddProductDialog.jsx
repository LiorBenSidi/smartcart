import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus, Store as StoreIcon, Loader2 } from 'lucide-react';

export default function AddProductDialog({ item, onClose, onSuccess }) {
  const [stores, setStores] = useState([]);
  const [selectedStores, setSelectedStores] = useState([]);
  const [productData, setProductData] = useState({
    gtin: item.code || '',
    canonical_name: item.name || '',
    category: item.category || '',
    brand_name: ''
  });
  const [priceData, setPriceData] = useState({
    current_price: item.price || 0,
    unit_price: item.price || 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadStores = async () => {
      const storesList = await base44.entities.Store.list();
      setStores(storesList);
    };
    loadStores();
  }, []);

  const toggleStore = (storeId) => {
    if (selectedStores.includes(storeId)) {
      setSelectedStores(selectedStores.filter(id => id !== storeId));
    } else {
      setSelectedStores([...selectedStores, storeId]);
    }
  };

  const handleSubmit = async () => {
    if (!productData.gtin || !productData.canonical_name || selectedStores.length === 0) {
      return;
    }

    setLoading(true);
    try {
      // Create product
      const product = await base44.entities.Product.create({
        gtin: productData.gtin,
        canonical_name: productData.canonical_name,
        category: productData.category,
        brand_name: productData.brand_name
      });

      // Create price entries for each selected store
      const pricePromises = selectedStores.map(store_id =>
        base44.entities.ProductPrice.create({
          gtin: productData.gtin,
          store_id,
          current_price: priceData.current_price,
          unit_price: priceData.unit_price,
          display_name: productData.canonical_name,
          price_updated_at: new Date().toISOString()
        })
      );

      await Promise.all(pricePromises);
      
      if (onSuccess) onSuccess(product);
      onClose();
    } catch (error) {
      console.error('Failed to add product', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="bg-indigo-50 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Add Product to Database</CardTitle>
            <button onClick={onClose} className="p-1 hover:bg-white rounded-md transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Product Code (GTIN)</label>
            <Input
              value={productData.gtin}
              onChange={(e) => setProductData({ ...productData, gtin: e.target.value })}
              placeholder="Enter barcode/GTIN"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Product Name *</label>
            <Input
              value={productData.canonical_name}
              onChange={(e) => setProductData({ ...productData, canonical_name: e.target.value })}
              placeholder="Enter product name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Category</label>
              <Input
                value={productData.category}
                onChange={(e) => setProductData({ ...productData, category: e.target.value })}
                placeholder="e.g. Dairy"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Brand</label>
              <Input
                value={productData.brand_name}
                onChange={(e) => setProductData({ ...productData, brand_name: e.target.value })}
                placeholder="Brand name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Price *</label>
              <Input
                type="number"
                step="0.01"
                value={priceData.current_price}
                onChange={(e) => setPriceData({ ...priceData, current_price: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Unit Price</label>
              <Input
                type="number"
                step="0.01"
                value={priceData.unit_price}
                onChange={(e) => setPriceData({ ...priceData, unit_price: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Select Stores *</label>
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => toggleStore(store.id)}
                  className={`w-full p-3 flex items-center gap-3 border-b border-gray-100 last:border-b-0 transition-colors ${
                    selectedStores.includes(store.id) ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selectedStores.includes(store.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                  }`}>
                    {selectedStores.includes(store.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <StoreIcon className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-900">{store.name}</div>
                    {store.city && <div className="text-xs text-gray-500">{store.city}</div>}
                  </div>
                </button>
              ))}
            </div>
            {selectedStores.length > 0 && (
              <div className="text-xs text-gray-500 mt-1">{selectedStores.length} store(s) selected</div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !productData.gtin || !productData.canonical_name || selectedStores.length === 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" /> Add Product</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}