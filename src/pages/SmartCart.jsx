import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import EnhancedProductSearch from '@/components/EnhancedProductSearch';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Plus, Trash2, RefreshCw, Store as StoreIcon, TrendingDown, Sparkles, CheckCircle, AlertCircle, Leaf, Heart, Tag, Car, Bus, Split, ArrowRight, Clock, CalendarDays, ChevronDown, ChevronUp, X, ShieldCheck, Search, Loader2, ThumbsUp, ThumbsDown, HelpCircle } from 'lucide-react';
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CartAlternatives from '@/components/CartAlternatives';
import DataCorrectionDialog from '@/components/DataCorrectionDialog';

export default function SmartCart() {
  const [cartItems, setCartItems] = useState([]);
  const [storeComparisons, setStoreComparisons] = useState([]);
  const [optimizedCart, setOptimizedCart] = useState(null);
  const [loadingComparisons, setLoadingComparisons] = useState(false);
  const [savedCarts, setSavedCarts] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [cartName, setCartName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [likedItems, setLikedItems] = useState(new Set());

  useEffect(() => {
      const fetchSuggestions = async () => {
          try {
              setLoadingSuggestions(true);
              const user = await base44.auth.me();
              const today = new Date().toISOString().split('T')[0];
              
              // Fetch preferences first to initialize state
              const prefs = await base44.entities.UserProductPreference.list();
              const likedSet = new Set(prefs.filter(p => p.preference === 'like').map(p => p.product_gtin));
              setLikedItems(likedSet);

              // Try to find existing draft for today
              const drafts = await base44.entities.SuggestedCartDraft.filter({ 
                  created_by: user.email, 
                  generated_date: today 
              });

              if (drafts.length > 0) {
                  setSuggestions(drafts[0]);
              } else {
                  // Trigger generation if none exists
                  const res = await base44.functions.invoke('generateDailySuggestions');
                  if (res.data.success) {
                      setSuggestions(res.data.draft);
                  }
              }
          } catch (error) {
              console.error("Failed to fetch suggestions", error);
          } finally {
              setLoadingSuggestions(false);
          }
      };
      fetchSuggestions();
  }, []);

  const applyOptimizedCart = () => {
    if (!optimizedCart) return;
    const newItems = optimizedCart.items.map(item => ({
        gtin: item.gtin,
        name: item.name || products.find(p => p.gtin === item.gtin)?.canonical_name || "Optimized Item",
        quantity: item.quantity
    }));
    setCartItems(newItems);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const loadData = async () => {
      const savedCartsList = await base44.entities.SavedCart.list('-created_date');
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
        setOptimizedCart(response.data.optimizedCart || null);
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

  const handlePreference = async (item, preference) => {
    try {
        const user = await base44.auth.me();

        // First, remove any existing preferences for this product
        const allExisting = await base44.entities.UserProductPreference.filter({
            user_id: user.email,
            product_gtin: item.product_id
        });
        await Promise.all(allExisting.map(p => base44.entities.UserProductPreference.delete(p.id)));

        if (preference === 'like') {
            if (likedItems.has(item.product_id)) {
                // Toggle OFF (Unlike)
                setLikedItems(prev => {
                    const next = new Set(prev);
                    next.delete(item.product_id);
                    return next;
                });
                toast.success("Removed from Liked Items");
            } else {
                // Toggle ON (Like)
                setLikedItems(prev => new Set([...prev, item.product_id]));
                await base44.entities.UserProductPreference.create({
                    user_id: user.email,
                    product_gtin: item.product_id,
                    product_name: item.product_name,
                    preference: 'like'
                });
                toast.success("Added to Liked Items");
            }
        } else if (preference === 'dislike') {
            // Remove from liked state if it was liked
            setLikedItems(prev => {
                const next = new Set(prev);
                next.delete(item.product_id);
                return next;
            });

            // Remove from suggestions locally
            if (suggestions && suggestions.items) {
                const newItems = suggestions.items.filter(i => i.product_id !== item.product_id);
                setSuggestions({ ...suggestions, items: newItems });
            }
            
            await base44.entities.UserProductPreference.create({
                user_id: user.email,
                product_gtin: item.product_id,
                product_name: item.product_name,
                preference: 'dislike'
            });
            toast.success("Removed from suggestions");
        }
    } catch (error) {
        console.error("Failed to update preference", error);
        toast.error("Failed to update preference");
    }
  };



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
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 rounded-2xl shadow-lg relative">
        <div className="absolute top-6 right-6">
             <RecommendationExplainer mode="smart_cart" className="text-white hover:bg-white/20 hover:text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <ShoppingCart className="w-7 h-7" />
          Smart Cart
        </h1>
        <p className="text-purple-100 text-sm">Compare prices or find better alternatives</p>
      </div>

      <Tabs defaultValue="build" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="build">Build Cart</TabsTrigger>
            <TabsTrigger value="ai">AI Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="build" className="space-y-6">

      {/* Suggested for Today */}
      {suggestions && suggestions.status === 'draft' && suggestions.items && suggestions.items.length > 0 && (
          <TooltipProvider>
          <Card className="border-indigo-100 bg-indigo-50/30 dark:bg-indigo-900/10 dark:border-indigo-900">
              <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                          <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          Suggested for Today
                      </CardTitle>
                      <Badge variant="outline" className="bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                          {suggestions.items.length} items
                      </Badge>
                  </div>
              </CardHeader>
              <CardContent>
                  <div className="space-y-3">
                      {suggestions.items.slice(0, showAllSuggestions ? undefined : 6).map((item, idx) => (
                          <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="font-semibold text-gray-900 dark:text-gray-100">{item.product_name}</span>
                                          <Tooltip>
                                              <TooltipTrigger asChild>
                                                  <Badge className={`text-[10px] px-1.5 py-0 h-5 cursor-help flex items-center gap-1 ${
                                                      item.reason_type.includes('Weekly') ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                  }`}>
                                                      {item.reason_type}
                                                      {item.reason_type.includes('Restock') && <HelpCircle className="w-2.5 h-2.5" />}
                                                  </Badge>
                                              </TooltipTrigger>
                                              {item.reason_type.includes('Restock') && (
                                                  <TooltipContent side="right" className="max-w-xs">
                                                      <div className="text-xs space-y-1">
                                                          <p className="font-semibold">Restock Suggestion</p>
                                                          <p>Based on your buying patterns:</p>
                                                          <p className="text-gray-300">• Avg. purchase every <span className="font-semibold">{Number(item.evidence?.avg_cadence_days || 0).toFixed(0)}</span> days</p>
                                                          <p className="text-gray-300">• Last bought <span className="font-semibold">{Number(item.evidence?.days_since_last_purchase || 0)}</span> days ago</p>
                                                          <p className="text-amber-300 mt-1">Time to restock: {item.evidence?.avg_cadence_days ? (Number(item.evidence.days_since_last_purchase || 0) / Number(item.evidence.avg_cadence_days)).toFixed(1) : '?'}x your cycle</p>
                                                      </div>
                                                  </TooltipContent>
                                              )}
                                          </Tooltip>
                                      </div>
                                      <div className="text-xs text-gray-500 flex items-center gap-3">
                                          <span>Qty: {item.suggested_qty}</span>
                                          <span className={`${item.confidence > 0.8 ? 'text-green-600' : 'text-gray-400'}`}>
                                              {item.confidence > 0.8 ? 'High Confidence' : 'Medium Confidence'}
                                          </span>
                                      </div>
                                      
                                      {/* Why Expander */}
                                      <button 
                                          onClick={() => setExpandedSuggestion(expandedSuggestion === idx ? null : idx)}
                                          className="text-[10px] text-indigo-500 flex items-center gap-1 mt-2 hover:underline"
                                      >
                                          Why? {expandedSuggestion === idx ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                      {expandedSuggestion === idx && (
                                          <div className="mt-2 text-[10px] text-gray-500 bg-gray-50 p-2 rounded">
                                              {item.reason_type.includes('Weekly') && (
                                                  <p> bought {item.evidence.occurrences} times on this weekday in last {item.evidence.n_weeks} weeks.</p>
                                              )}
                                              {item.reason_type.includes('Restock') && (
                                                  <p> Usually bought every {item.evidence.avg_cadence_days} days. Last bought {item.evidence.days_since_last_purchase} days ago.</p>
                                              )}
                                          </div>
                                      )}
                                  </div>
                                  <div className="flex flex-col gap-2 items-center">
                                      <Button 
                                          size="sm" 
                                          className="h-8 w-8 p-0 bg-indigo-600 hover:bg-indigo-700 mb-1"
                                          onClick={() => {
                                              addToCart({ gtin: item.product_id, canonical_name: item.product_name });
                                          }}
                                      >
                                          <Plus className="w-4 h-4" />
                                      </Button>
                                      <div className="flex gap-1">
                                          <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className={`h-6 w-6 p-0 ${likedItems.has(item.product_id) ? 'bg-green-100 hover:bg-green-200' : 'hover:bg-green-50'}`} 
                                              onClick={() => handlePreference(item, 'like')}
                                          >
                                              <ThumbsUp className={`w-3 h-3 ${likedItems.has(item.product_id) ? 'text-green-700 fill-current' : 'text-green-600'}`} />
                                          </Button>
                                          <Button 
                                              size="sm" 
                                              variant="ghost" 
                                              className="h-6 w-6 p-0 hover:bg-red-50" 
                                              onClick={() => handlePreference(item, 'dislike')}
                                              disabled={likedItems.has(item.product_id)}
                                          >
                                              <ThumbsDown className={`w-3 h-3 ${likedItems.has(item.product_id) ? 'text-gray-300' : 'text-red-600'}`} />
                                          </Button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
                  
                  <div className="mt-4 flex gap-3">
                      <Button 
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => {
                              suggestions.items.forEach(item => {
                                  addToCart({ gtin: item.product_id, canonical_name: item.product_name });
                              });
                              // Mark draft as accepted?
                          }}
                      >
                          Add All to Cart
                      </Button>
                      <Button 
                          variant="outline"
                          className="text-gray-500"
                          onClick={async () => {
                              try {
                                  await base44.entities.SuggestedCartDraft.update(suggestions.id, { status: 'dismissed' });
                                  setSuggestions(null);
                              } catch(e) { console.error(e); }
                          }}
                      >
                          Dismiss
                      </Button>
                  </div>
                  {suggestions.items.length > 6 && (
                      <div className="text-center mt-2">
                          <button 
                              className="text-xs text-gray-500 hover:text-indigo-600"
                              onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                          >
                              {showAllSuggestions ? 'Show Less' : `Show ${suggestions.items.length - 6} More`}
                          </button>
                      </div>
                  )}
              </CardContent>
              </Card>
              </TooltipProvider>
              )}

              {/* Enhanced Product Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Products to Cart</CardTitle>
        </CardHeader>
        <CardContent>
          <EnhancedProductSearch onAddToCart={addToCart} />
        </CardContent>
      </Card>

      {/* Cart Summary */}
      <Card className="bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                {totalItems}
              </div>
              <div>
                <div className="font-bold text-gray-900 dark:text-gray-100">Items in Cart</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{cartItems.length} unique products</div>
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
                <div key={cart.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-gray-100">{cart.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {cart.store_name} • {new Date(cart.created_date).toLocaleDateString()} at {new Date(cart.created_date).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
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
                <div key={item.gtin} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                      {item.quantity}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{item.gtin}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.gtin, -1)}>-</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.gtin, 1)}>+</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromCart(item.gtin)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                  <DataCorrectionDialog 
                      entityType="product" 
                      entityId={item.gtin} 
                      entityName={item.name} 
                      defaultIssueType="price" 
                  />
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
                <Card key={idx} className={`border-2 ${idx === 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : idx === 1 ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {idx === 0 && <Badge className="bg-green-600 text-white">Best Deal</Badge>}
                          {idx === 1 && <Badge className="bg-blue-600 text-white">2nd Best</Badge>}
                          {idx === 2 && <Badge className="bg-orange-600 text-white">3rd Best</Badge>}
                        </div>
                        <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">{comparison.chain?.name || comparison.store?.name}</h4>
                        {comparison.nearestBranch && (
                          <div className="mt-2 space-y-1">
                            <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <StoreIcon className="w-4 h-4" />
                              {comparison.nearestBranch.city || comparison.nearestBranch.address_line}
                              {!comparison.drivingInfo && comparison.distance && (
                                <span className="text-gray-500 ml-2">• {comparison.distance.toFixed(1)} km (linear)</span>
                              )}
                            </div>
                            
                            {comparison.drivingInfo && (
                                <div className="text-xs text-gray-600 flex items-center gap-3">
                                    <div className="flex items-center gap-1" title="Driving">
                                        <Car className="w-3 h-3 text-indigo-600" />
                                        <span>{comparison.drivingInfo.duration} ({comparison.drivingInfo.distance})</span>
                                    </div>
                                    {comparison.transitInfo && (
                                         <div className="flex items-center gap-1" title="Public Transport">
                                            <Bus className="w-3 h-3 text-indigo-600" />
                                            <span>{comparison.transitInfo.duration}</span>
                                        </div>
                                    )}
                                </div>
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
                        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">₪{comparison.totalCost.toFixed(2)}</div>
                        {idx > 0 && storeComparisons[0] && (
                          <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                            +₪{(comparison.totalCost - storeComparisons[0].totalCost).toFixed(2)} more
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  </Card>
                  ))}

                  {/* Optimization Suggestion */}
                  {optimizedCart && (
                  <div className="mt-8">
                  <div className="bg-gradient-to-br from-violet-600 to-indigo-700 text-white p-1 rounded-2xl shadow-xl">
                      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-12 w-12 bg-violet-100 dark:bg-violet-900/50 rounded-full flex items-center justify-center">
                                <Split className="w-6 h-6 text-violet-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Smart Cart Optimization</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Split your cart to maximize savings</p>
                            </div>
                            <div className="ml-auto">
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 text-sm px-3 py-1">
                                    Save ₪{optimizedCart.savings.toFixed(2)}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Current Best</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">₪{optimizedCart.originalCost.toFixed(2)}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Single Store</p>
                            </div>
                            <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 ring-2 ring-violet-200 dark:ring-violet-800 ring-offset-2 dark:ring-offset-gray-900">
                                <p className="text-xs text-violet-600 dark:text-violet-400 uppercase tracking-wide font-semibold">Optimized</p>
                                <p className="text-2xl font-bold text-violet-700 dark:text-violet-300 mt-1">₪{optimizedCart.totalCost.toFixed(2)}</p>
                                <p className="text-xs text-violet-400 dark:text-violet-500 mt-1">Multi-Store Split</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                           <h4 className="font-semibold text-gray-900 text-sm">Split Strategy:</h4>
                           <div className="grid gap-2">
                             {Array.from(new Set(optimizedCart.items.map(i => i.store?.name))).map(storeName => (
                                <div key={storeName} className="flex items-center justify-between text-sm p-3 rounded-lg border border-gray-100 bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <StoreIcon className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium text-gray-700">{storeName}</span>
                                    </div>
                                    <Badge variant="secondary" className="bg-white shadow-sm text-gray-600">
                                        {optimizedCart.items.filter(i => i.store?.name === storeName).length} items
                                    </Badge>
                                </div>
                             ))}
                           </div>
                        </div>

                        <Button 
                            className="w-full mt-6 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 h-12 text-base"
                            onClick={applyOptimizedCart}
                        >
                            <Sparkles className="w-5 h-5 mr-2" /> Apply Optimized Cart
                        </Button>
                      </div>
                  </div>
                  </div>
                  )}

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
      </TabsContent>

      <TabsContent value="ai">
        <CartAlternatives />
      </TabsContent>

      </Tabs>
    </div>);

}