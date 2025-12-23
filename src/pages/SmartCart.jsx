import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, RefreshCw, Store as StoreIcon, TrendingDown, Sparkles, CheckCircle, AlertCircle, Leaf, Heart, Tag } from 'lucide-react';

export default function SmartCart() {
  const [cartItems, setCartItems] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [storeComparisons, setStoreComparisons] = useState([]);
  const [loadingComparisons, setLoadingComparisons] = useState(false);
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
    if (cartItems.length > 0) {
      fetchComparisons();
    } else {
      setStoreComparisons([]);
    }
  }, [cartItems, userLocation]);

  const fetchComparisons = async () => {
    setLoadingComparisons(true);
    try {
      const response = await base44.functions.invoke('getCartRecommendations', {
        cartItems: cartItems.map((item) => ({ gtin: item.gtin, quantity: item.quantity })),
        userLat: userLocation?.lat,
        userLon: userLocation?.lon
      });
      setStoreComparisons(response.data.topStores || []);
    } catch (error) {
      console.error('Failed to load comparisons', error);
    } finally {
      setLoadingComparisons(false);
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
      const bestStore = storeComparisons.length > 0 ? storeComparisons[0] : null;
      
      await base44.entities.SavedCart.create({
        name: cartName,
        store_id: bestStore?.store?.id,
        store_name: bestStore?.store?.name,
        items: cartItems.map(item => ({ ...item, price: 0 })),
        total_amount: bestStore?.totalCost || 0,
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
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <ShoppingCart className="w-7 h-7" />
          Smart Cart Comparison
        </h1>
        <p className="text-purple-100 text-sm">Build your cart and find the cheapest supermarkets near you</p>
      </div>

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
            <Button variant="outline" size="sm" onClick={fetchComparisons} disabled={loadingComparisons}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingComparisons ? 'animate-spin' : ''}`} />
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

      {/* Cart Items List */}
      {cartItems.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-gray-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Your cart is empty. Add products to compare prices!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Cart Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Cart Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartItems.map((item) => (
                <div key={item.gtin} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm">
                      {item.quantity}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.gtin}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.gtin, -1)}>-</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.gtin, 1)}>+</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromCart(item.gtin)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Store Comparisons */}
          {loadingComparisons ? (
            <Card>
              <CardContent className="p-10 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
                <p className="text-sm">Comparing prices across supermarkets...</p>
              </CardContent>
            </Card>
          ) : storeComparisons.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingDown className="w-6 h-6 text-green-600" />
                Top 3 Cheapest Supermarkets
              </h3>
              {storeComparisons.map((comparison, idx) => (
                <Card key={idx} className={`border-2 ${idx === 0 ? 'border-green-500 bg-green-50' : idx === 1 ? 'border-blue-400 bg-blue-50' : 'border-orange-400 bg-orange-50'}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {idx === 0 && <Badge className="bg-green-600 text-white">Best Deal</Badge>}
                          {idx === 1 && <Badge className="bg-blue-600 text-white">2nd Best</Badge>}
                          {idx === 2 && <Badge className="bg-orange-600 text-white">3rd Best</Badge>}
                        </div>
                        <h4 className="text-xl font-bold text-gray-900">{comparison.chain?.name || comparison.store?.name}</h4>
                        {comparison.nearestBranch && (
                          <div className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                            <StoreIcon className="w-4 h-4" />
                            {comparison.nearestBranch.city || comparison.nearestBranch.address_line}
                            {comparison.distance && (
                              <span className="text-gray-500 ml-2">• {comparison.distance.toFixed(1)} km away</span>
                            )}
                          </div>
                        )}
                        {comparison.availableItems !== cartItems.length && (
                          <div className="text-xs text-amber-600 mt-2">
                            ⚠️ Only {comparison.availableItems} of {cartItems.length} items available
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-gray-900">₪{comparison.totalCost.toFixed(2)}</div>
                        {idx > 0 && storeComparisons[0] && (
                          <div className="text-sm text-red-600 mt-1">
                            +₪{(comparison.totalCost - storeComparisons[0].totalCost).toFixed(2)} more
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No price data available for comparison</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>);

}