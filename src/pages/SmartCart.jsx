import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, RefreshCw, Store as StoreIcon, TrendingDown, Sparkles, CheckCircle, AlertCircle, Leaf, Heart, Tag } from 'lucide-react';

export default function SmartCart() {
  const [cartItems, setCartItems] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [savedCarts, setSavedCarts] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [cartName, setCartName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const [storesList, productsList, savedCartsList] = await Promise.all([
        base44.entities.Store.list(),
        base44.entities.Product.list('-updated_date', 100),
        base44.entities.SavedCart.list('-created_date')
      ]);
      setStores(storesList);
      setProducts(productsList);
      setSavedCarts(savedCartsList);

      if (storesList.length > 0 && !selectedStore) {
        setSelectedStore(storesList[0]);
      }
    };
    loadData();

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.error('Failed to get location', error);
        }
      );
    }
  }, []);

  useEffect(() => {
    if (cartItems.length > 0 && selectedStore) {
      fetchRecommendations();
    } else {
      setRecommendations([]);
    }
  }, [cartItems, selectedStore]);

  const fetchRecommendations = async () => {
    setLoadingRecommendations(true);
    try {
      const response = await base44.functions.invoke('getCartRecommendations', {
        cartItems: cartItems.map((item) => ({ gtin: item.gtin, quantity: item.quantity })),
        store_id: selectedStore.id,
        userLat: userLocation?.lat,
        userLon: userLocation?.lon
      });
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Failed to load recommendations', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const addToCart = (product) => {
    const existing = cartItems.find((item) => item.gtin === product.gtin);
    if (existing) {
      setCartItems(cartItems.map((item) =>
      item.gtin === product.gtin ?
      { ...item, quantity: item.quantity + 1 } :
      item
      ));
    } else {
      setCartItems([...cartItems, { gtin: product.gtin, name: product.canonical_name, quantity: 1 }]);
    }
  };

  const removeFromCart = (gtin) => {
    setCartItems(cartItems.filter((item) => item.gtin !== gtin));
  };

  const replaceItem = (originalGtin, newProduct) => {
    setCartItems(cartItems.map((item) =>
    item.gtin === originalGtin ?
    { gtin: newProduct.gtin, name: newProduct.canonical_name, quantity: item.quantity } :
    item
    ));
  };

  const updateQuantity = (gtin, delta) => {
    setCartItems(cartItems.map((item) => {
      if (item.gtin === gtin) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const filteredProducts = searchTerm ?
  products.filter((p) =>
  p.canonical_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
  p.gtin?.includes(searchTerm) ||
  p.brand_name?.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 5) :
  [];

  const getReasonIcon = (reason) => {
    if (reason.includes('cheaper')) return <TrendingDown className="w-3 h-3" />;
    if (reason.includes('organic')) return <Leaf className="w-3 h-3" />;
    if (reason.includes('sugar') || reason.includes('sodium')) return <Heart className="w-3 h-3" />;
    if (reason.includes('brand')) return <Tag className="w-3 h-3" />;
    return <Sparkles className="w-3 h-3" />;
  };

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const saveCart = async () => {
    if (!cartName.trim()) return;
    setSaving(true);
    try {
      const itemsWithPrices = await Promise.all(
        cartItems.map(async (item) => {
          const prices = await base44.entities.ProductPrice.filter({ gtin: item.gtin, store_id: selectedStore?.id });
          const price = prices.length > 0 ? prices[0].current_price : 0;
          return { ...item, price };
        })
      );

      const totalAmount = itemsWithPrices.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      await base44.entities.SavedCart.create({
        name: cartName,
        store_id: selectedStore?.id,
        store_name: selectedStore?.name,
        items: itemsWithPrices,
        total_amount: totalAmount,
        total_items: totalItems
      });

      const updatedCarts = await base44.entities.SavedCart.list('-created_date');
      setSavedCarts(updatedCarts);
      setShowSaveDialog(false);
      setCartName('');
    } catch (error) {
      console.error('Failed to save cart', error);
    } finally {
      setSaving(false);
    }
  };

  const loadSavedCart = (savedCart) => {
    setCartItems(savedCart.items.map(item => ({ gtin: item.gtin, name: item.name, quantity: item.quantity })));
    const store = stores.find(s => s.id === savedCart.store_id);
    if (store) setSelectedStore(store);
    setShowHistory(false);
  };

  const deleteSavedCart = async (id) => {
    await base44.entities.SavedCart.delete(id);
    const updatedCarts = await base44.entities.SavedCart.list('-created_date');
    setSavedCarts(updatedCarts);
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">Cart


        </h1>
        <p className="text-purple-100 text-sm">Get personalized product recommendations while you shop</p>
      </div>

      {/* Store Selection */}
      <Card>
        <CardContent className="p-4">
          <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <StoreIcon className="w-4 h-4" />
            Shopping At
          </label>
          <Select value={selectedStore?.id} onValueChange={(id) => setSelectedStore(stores.find((s) => s.id === id))}>
            <SelectTrigger>
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) =>
              <SelectItem key={store.id} value={store.id}>
                  {store.name} {store.city && `• ${store.city}`}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Add Products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Products to Cart</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />

          {filteredProducts.length > 0 &&
          <div className="space-y-2">
              {filteredProducts.map((product) =>
            <div key={product.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{product.canonical_name}</div>
                    <div className="text-xs text-gray-500">{product.brand_name} • {product.gtin}</div>
                  </div>
                  <Button size="sm" onClick={() => {addToCart(product);setSearchTerm('');}}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
            )}
            </div>
          }
        </CardContent>
      </Card>

      {/* Cart Summary */}
      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                {totalItems}
              </div>
              <div>
                <div className="font-bold text-gray-900">Items in Cart</div>
                <div className="text-xs text-gray-600">{cartItems.length} unique products</div>
              </div>
            </div>
            {cartItems.length > 0 &&
            <Button variant="outline" size="sm" onClick={fetchRecommendations} disabled={loadingRecommendations}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingRecommendations ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            }
          </div>
          <div className="flex gap-2">
            {cartItems.length > 0 && (
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setShowSaveDialog(true)}>
                Save Cart
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide' : 'Show'} History
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Dialog */}
      {showSaveDialog && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-lg">Save Cart List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Enter cart name (e.g., Weekly Groceries)"
              value={cartName}
              onChange={(e) => setCartName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowSaveDialog(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={saveCart} disabled={saving || !cartName.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Carts History */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved Cart Lists</CardTitle>
            <p className="text-xs text-amber-600 mt-1">⚠️ Prices and availability shown are from the time each list was created</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedCarts.length === 0 ? (
              <p className="text-center text-gray-400 py-6">No saved carts yet</p>
            ) : (
              savedCarts.map((cart) => (
                <div key={cart.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900">{cart.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {cart.store_name} • {new Date(cart.created_date).toLocaleDateString()} at {new Date(cart.created_date).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {cart.total_items} items • ₪{cart.total_amount?.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => loadSavedCart(cart)}>
                        Load
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteSavedCart(cart.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 bg-amber-50 p-2 rounded border border-amber-200">
                    📅 Historical pricing from {new Date(cart.created_date).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Cart Items with Recommendations */}
      {cartItems.length === 0 ?
      <Card>
          <CardContent className="p-10 text-center text-gray-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Your cart is empty. Add products to see smart recommendations!</p>
          </CardContent>
        </Card> :

      <div className="space-y-6">
          {cartItems.map((item, idx) => {
          const itemRec = recommendations.find((r) => r.originalItem?.gtin === item.gtin);

          return (
            <Card key={item.gtin} className="overflow-hidden">
                {/* Current Item */}
                <CardHeader className="bg-gray-50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold">
                        {item.quantity}
                      </div>
                      <div>
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <div className="text-xs text-gray-500 mt-1">
                          Code: {item.gtin}
                          {itemRec?.originalPrice > 0 &&
                        <span className="ml-2">• ₪{itemRec.originalPrice.toFixed(2)}</span>
                        }
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.gtin, -1)}>-</Button>
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.gtin, 1)}>+</Button>
                      <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.gtin)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Recommendations */}
                {loadingRecommendations ?
              <CardContent className="p-6 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto mb-2"></div>
                    <p className="text-sm">Finding alternatives...</p>
                  </CardContent> :
              itemRec?.alternatives?.length > 0 ?
              <CardContent className="p-4 space-y-3">
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      Recommended Alternatives
                    </div>
                    {itemRec.alternatives.map((alt, altIdx) =>
                <div key={altIdx} className={`p-4 rounded-lg border-2 transition-all ${
                alt.storeLevel === 'same_store' ? 'border-green-200 bg-green-50' :
                alt.storeLevel === 'same_chain' ? 'border-blue-200 bg-blue-50' :
                'border-orange-200 bg-orange-50'}`
                }>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="font-bold text-gray-900">{alt.product.canonical_name}</div>
                            <div className="text-xs text-gray-600 mt-1">{alt.product.brand_name}</div>
                            
                            <div className="flex flex-wrap gap-1 mt-2">
                              {alt.reasons.slice(0, 3).map((reason, i) =>
                        <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                                  {getReasonIcon(reason)}
                                  {reason}
                                </Badge>
                        )}
                            </div>

                            {alt.storeLevel !== 'same_store' &&
                      <div className="mt-2 text-xs flex items-center gap-1">
                                {alt.storeLevel === 'same_chain' ?
                        <Badge className="bg-blue-600 text-white">Same Chain</Badge> :

                        <Badge className="bg-orange-600 text-white">Other Store</Badge>
                        }
                                <span className="text-gray-600">{alt.store?.name}</span>
                                {alt.distance && (
                                  <span className="text-gray-500">• {alt.distance.toFixed(1)} km</span>
                                )}
                              </div>
                      }
                          </div>

                          <div className="text-right">
                            <div className="text-xl font-bold text-gray-900">₪{alt.price.toFixed(2)}</div>
                            {alt.priceDiff > 0 ?
                      <div className="text-xs text-green-600 font-bold mt-1">
                                Save ₪{alt.priceDiff.toFixed(2)}
                              </div> :

                      <div className="text-xs text-red-600 font-bold mt-1">
                                +₪{Math.abs(alt.priceDiff).toFixed(2)}
                              </div>
                      }
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
                          <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => addToCart(alt.product)}>

                            <Plus className="w-3 h-3 mr-1" />
                            Add to Cart
                          </Button>
                          <Button
                      size="sm"
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      onClick={() => replaceItem(item.gtin, alt.product)}>

                            <RefreshCw className="w-3 h-3 mr-1" />
                            Replace
                          </Button>
                        </div>
                      </div>
                )}
                  </CardContent> :
              !loadingRecommendations &&
              <CardContent className="p-6 text-center text-gray-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No alternatives found for this product</p>
                  </CardContent>
              }
              </Card>);

        })}
        </div>
      }
    </div>);

}