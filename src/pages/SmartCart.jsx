import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import EnhancedProductSearch from '@/components/EnhancedProductSearch';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Plus, Trash2, RefreshCw, Store as StoreIcon, TrendingDown, Sparkles, CheckCircle, AlertCircle, Leaf, Heart, Tag, Car, Bus, Split, ArrowRight, Clock, CalendarDays, ChevronDown, ChevronUp, X, ShieldCheck, Search, Loader2, ThumbsUp, ThumbsDown, HelpCircle, Settings } from 'lucide-react';
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CartAlternatives from '@/components/CartAlternatives';
import DataCorrectionDialog from '@/components/DataCorrectionDialog';
import { processManager } from "@/components/processManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const [editingCartId, setEditingCartId] = useState(null); // For editing saved carts
  const [itemPrices, setItemPrices] = useState({}); // Store prices per item by gtin
  const [cartItemPrices, setCartItemPrices] = useState({}); // Store all chain prices per gtin: { gtin: { chain_id: { price, chain_id, store_id } } }
  const [chains, setChains] = useState([]); // All chains for display
  const [userLocation, setUserLocation] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [expandedSuggestion, setExpandedSuggestion] = useState(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [likedItems, setLikedItems] = useState(new Set());
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const [weeklyWeight, setWeeklyWeight] = useState(0.5);
  const [collaborativeWeight, setCollaborativeWeight] = useState(0.5);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [addedItems, setAddedItems] = useState(new Set());
  const [showPriceCompare, setShowPriceCompare] = useState(null); // cart id to show price comparison

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        setLoadingSuggestions(true);
        const user = await base44.auth.me();
        const today = new Date().toISOString().split('T')[0];

        // Fetch preferences first to initialize state
        const prefs = await base44.entities.UserProductPreference.list();
        const likedSet = new Set(prefs.filter((p) => p.preference === 'like').map((p) => p.product_gtin));
        setLikedItems(likedSet);

        // Try to find existing draft for today
        const drafts = await base44.entities.SuggestedCartDraft.filter({
          created_by: user.email,
          generated_date: today
        });

        if (drafts.length > 0) {
          setSuggestions(drafts[0]);
        } else {
          // Trigger generation via processManager if none exists
          await processManager.startProcess('generateDailySuggestions', {
            currentCartItems: cartItems.map((item) => item.gtin),
            weeklyWeight,
            collaborativeWeight
          });

          // Fetch the newly created draft
          const newDrafts = await base44.entities.SuggestedCartDraft.filter({
            created_by: user.email,
            generated_date: today
          });
          if (newDrafts.length > 0) {
            setSuggestions(newDrafts[0]);
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

  const refreshSuggestions = async () => {
    try {
      setRefreshingSuggestions(true);
      await processManager.startProcess('generateDailySuggestions', {
        currentCartItems: cartItems.map((item) => item.gtin),
        weeklyWeight,
        collaborativeWeight
      });

      // Fetch the updated draft
      const user = await base44.auth.me();
      const today = new Date().toISOString().split('T')[0];
      const drafts = await base44.entities.SuggestedCartDraft.filter({
        created_by: user.email,
        generated_date: today
      });

      if (drafts.length > 0) {
        setSuggestions(drafts[0]);
        toast.success("Suggestions refreshed!");
      }
    } catch (error) {
      console.error("Failed to refresh suggestions", error);
      toast.error("Failed to refresh suggestions: " + error.message);
    } finally {
      setRefreshingSuggestions(false);
    }
  };

  const applyOptimizedCart = () => {
    if (!optimizedCart) return;
    const newItems = optimizedCart.items.map((item) => ({
      gtin: item.gtin,
      name: item.name || products.find((p) => p.gtin === item.gtin)?.canonical_name || "Optimized Item",
      quantity: item.quantity
    }));
    setCartItems(newItems);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const loadData = async () => {
      const [savedCartsList, chainsList] = await Promise.all([
        base44.entities.SavedCart.list('-created_date'),
        base44.entities.Chain.list()
      ]);
      setSavedCarts(savedCartsList);
      setChains(chainsList);
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
      
      // Extract prices for items from the best store (first comparison)
      if (response.data.topStores?.length > 0) {
        const bestStore = response.data.topStores[0];
        const prices = {};
        if (bestStore.itemPrices) {
          bestStore.itemPrices.forEach(ip => {
            prices[ip.gtin] = ip.price;
          });
        }
        setItemPrices(prices);
      }
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
      setCartItems([...cartItems, { 
        gtin: product.gtin, 
        name: product.canonical_name, 
        quantity: 1, 
        fromSuggestion: product.fromSuggestion || false 
      }]);
    }
  };
  
  // Add to cart with all chain prices stored
  const addToCartWithPrices = (product, pricesByChain, fromSuggestion = false) => {
    const existing = cartItems.find((item) => item.gtin === product.gtin);
    if (existing) {
      setCartItems(cartItems.map((item) =>
        item.gtin === product.gtin ?
        { ...item, quantity: item.quantity + 1 } :
        item
      ));
    } else {
      setCartItems([...cartItems, { 
        gtin: product.gtin, 
        name: product.canonical_name, 
        quantity: 1,
        fromSuggestion 
      }]);
    }
    
    // Store all chain prices for this gtin
    setCartItemPrices(prev => ({
      ...prev,
      [product.gtin]: pricesByChain
    }));
  };
  
  // Calculate best chains based on stored prices
  const calculateBestChains = () => {
    if (cartItems.length === 0 || Object.keys(cartItemPrices).length === 0) return [];
    
    // Get all unique chain IDs that have prices for any cart item
    const chainTotals = {};
    
    cartItems.forEach(item => {
      const itemPricesForGtin = cartItemPrices[item.gtin];
      if (itemPricesForGtin) {
        Object.entries(itemPricesForGtin).forEach(([chainId, priceData]) => {
          if (!chainTotals[chainId]) {
            chainTotals[chainId] = { total: 0, itemCount: 0, items: [] };
          }
          chainTotals[chainId].total += priceData.price * item.quantity;
          chainTotals[chainId].itemCount++;
          chainTotals[chainId].items.push({
            gtin: item.gtin,
            name: item.name,
            price: priceData.price,
            quantity: item.quantity
          });
        });
      }
    });
    
    // Sort chains by total cost and filter to only those with all items
    return Object.entries(chainTotals)
      .filter(([_, data]) => data.itemCount === cartItems.length) // Only chains with all items
      .map(([chainId, data]) => ({
        chain_id: chainId,
        chain: chains.find(c => c.id === chainId),
        totalCost: data.total,
        itemCount: data.itemCount,
        items: data.items
      }))
      .sort((a, b) => a.totalCost - b.totalCost)
      .slice(0, 3);
  };
  
  const bestChains = calculateBestChains();

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
      await Promise.all(allExisting.map((p) => base44.entities.UserProductPreference.delete(p.id)));

      if (preference === 'like') {
        if (likedItems.has(item.product_id)) {
          // Toggle OFF (Unlike)
          setLikedItems((prev) => {
            const next = new Set(prev);
            next.delete(item.product_id);
            return next;
          });
          toast.success("Removed from Liked Items");
        } else {
          // Toggle ON (Like)
          setLikedItems((prev) => new Set([...prev, item.product_id]));
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
        setLikedItems((prev) => {
          const next = new Set(prev);
          next.delete(item.product_id);
          return next;
        });

        // Remove from suggestions locally
        if (suggestions && suggestions.items) {
          const newItems = suggestions.items.filter((i) => i.product_id !== item.product_id);
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
          const bestChain = bestChains.length > 0 ? bestChains[0] : null;

          // Build items with prices from all chains
          const itemsWithPrices = cartItems.map((item) => ({
            ...item,
            price: bestChain ? (cartItemPrices[item.gtin]?.[bestChain.chain_id]?.price || 0) : 0,
            chainPrices: cartItemPrices[item.gtin] || {}, // Store all chain prices
            fromSuggestion: item.fromSuggestion || false // Preserve suggestion tag
          }));

          if (editingCartId) {
            // Update existing cart
            await base44.entities.SavedCart.update(editingCartId, {
              name: cartName,
              store_id: bestChain?.chain_id,
              store_name: bestChain?.chain?.name,
              items: itemsWithPrices,
              total_amount: bestChain?.totalCost || 0,
              total_items: totalItems
            });
            toast.success("Cart updated!");
          } else {
            // Create new cart
            await base44.entities.SavedCart.create({
              name: cartName,
              store_id: bestChain?.chain_id,
              store_name: bestChain?.chain?.name,
              items: itemsWithPrices,
              total_amount: bestChain?.totalCost || 0,
              total_items: totalItems
            });
            toast.success("Cart saved!");
          }

          const updatedCarts = await base44.entities.SavedCart.list('-created_date');
          setSavedCarts(updatedCarts);
          setShowSaveDialog(false);
          setCartName('');
          setEditingCartId(null);
        } catch (error) {
          console.error('Failed to save cart', error);
          toast.error("Failed to save cart");
        } finally {
          setSaving(false);
        }
      };



  const loadSavedCart = (savedCart) => {
    setCartItems(savedCart.items.map((item) => ({ 
      gtin: item.gtin, 
      name: item.name, 
      quantity: item.quantity,
      fromSuggestion: item.fromSuggestion || false 
    })));
    // Also load the stored chain prices
    const loadedPrices = {};
    savedCart.items.forEach(item => {
      if (item.chainPrices) {
        loadedPrices[item.gtin] = item.chainPrices;
      }
    });
    setCartItemPrices(loadedPrices);
    setShowHistory(false);
    // Trigger save dialog to show comparison
    setCartName(savedCart.name + ' (copy)');
    setShowSaveDialog(true);
  };

  const editSavedCart = (savedCart) => {
    // Load the cart items for editing including fromSuggestion flag
    setCartItems(savedCart.items.map((item) => ({ 
      gtin: item.gtin, 
      name: item.name, 
      quantity: item.quantity,
      fromSuggestion: item.fromSuggestion || false 
    })));
    // Also load the stored chain prices
    const loadedPrices = {};
    savedCart.items.forEach(item => {
      if (item.chainPrices) {
        loadedPrices[item.gtin] = item.chainPrices;
      }
    });
    setCartItemPrices(loadedPrices);
    setEditingCartId(savedCart.id);
    setCartName(savedCart.name);
    setShowHistory(false);
    // Show save dialog with comparison table
    setShowSaveDialog(true);
    toast.info("Editing cart - make changes and save");
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

      <div className="space-y-6">

      {/* Suggested for Today */}
      {(loadingSuggestions || suggestions && suggestions.status === 'draft') &&
        <TooltipProvider>
          <Card className="border-indigo-100 bg-indigo-50/30 dark:bg-indigo-900/10 dark:border-indigo-900">
              <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowSuggestions(!showSuggestions)}>
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                          <CardTitle className="text-lg flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                              <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                              Suggested for Today
                              {loadingSuggestions && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
                              {showSuggestions ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
                          </CardTitle>
                          <Dialog>
                              <DialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900">
                                      <HelpCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                  </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto dark:bg-gray-900">
                                  <DialogHeader>
                                      <DialogTitle className="flex items-center gap-2">
                                          <CalendarDays className="w-5 h-5 text-indigo-600" />
                                          Daily Suggestions - Technical Details
                                      </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 text-sm dark:text-gray-200">
                                      <div>
                                          <h4 className="font-semibold mb-2">Algorithm Overview:</h4>
                                          <p className="text-gray-700 dark:text-gray-300 mb-2">Runs daily to predict what you should buy today based on your purchase history.</p>
                                      </div>

                                      <div className="bg-slate-800 border border-slate-700 p-4 rounded">
                                          <h4 className="font-semibold mb-2 text-white">Weekly Pattern Detection:</h4>
                                          <div className="space-y-2 text-gray-300">
                                              <p className="text-xs">Analyzes purchases from all available historical weeks:</p>
                                              <ul className="list-disc list-inside ml-4 text-xs space-y-1">
                                                  <li>Groups receipts by day of week (e.g., all your Fridays)</li>
                                                  <li>Counts how often each product appears on this weekday</li>
                                                  <li>Threshold: Product must appear ≥50% of weeks</li>
                                                  <li>occurrences: This represents the number of times the user has purchased that specific item on the same day of the week (e.g., every Monday) within the observation period</li>
                                                  <li>total_weeks: This is the total number of weeks being considered in that observation period</li>
                                                  <li>Confidence = (occurrences / total_weeks)</li>
                                              </ul>
                                              <p className="text-xs mt-3"><strong>Example:</strong> If you bought milk on 6 out of 8 Fridays → 75% confidence for Friday milk suggestion</p>
                                          </div>
                                      </div>

                                      <div className="bg-slate-900 border border-yellow-700/30 p-4 rounded">
                                          <h4 className="font-semibold mb-2 text-yellow-400">Restock Prediction (Cadence-Based):</h4>
                                          <div className="space-y-2 text-gray-300">
                                              <p className="text-xs">Uses UserProductHabit records (pre-calculated):</p>
                                              <ul className="list-disc list-inside ml-4 text-xs space-y-1">
                                                  <li>avg_cadence_days: Average days between purchases</li>
                                                  <li>last_purchase_date: When you last bought it</li>
                                                  <li>days_since = (today - last_purchase_date)</li>
                                                  <li>ratio = days_since / avg_cadence_days</li>
                                                  <li>Suggests if ratio ≥ 0.85 (85% through cycle)</li>
                                              </ul>
                                              <p className="text-xs mt-3"><strong>Example:</strong> You buy eggs every 7 days. Last purchase was 6 days ago → ratio=0.86 → suggest restock!</p>
                                          </div>
                                      </div>

                                      <div>
                                          <h4 className="font-semibold mb-2">Quantity Estimation:</h4>
                                          <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300 space-y-1">
                                              <li>Weekly suggestions: Uses mode (most common quantity)</li>
                                              <li>Restock suggestions: Uses average quantity from habits</li>
                                              <li>Default to 1 if no history</li>
                                          </ul>
                                      </div>

                                      <div className="bg-orange-900/20 border border-orange-700/30 p-4 rounded">
                                          <h4 className="font-semibold mb-2 text-orange-400">Collaborative Filtering:</h4>
                                          <div className="space-y-2 text-gray-300">
                                              <p className="text-xs">Identifies products bought by users similar to you:</p>
                                              <ul className="list-disc list-inside ml-4 text-xs space-y-1">
                                                  <li>Compares your purchase patterns with other users to find "neighbors".</li>
                                                  <li>Recommends products frequently purchased by your neighbors that you haven't bought.</li>
                                                  <li>Confidence is based on neighbor similarity and purchase frequency.</li>
                                              </ul>
                                              <p className="text-xs mt-3"><strong>Example:</strong> Similar users often buy fresh herbs with their produce. If you don't, it's suggested!</p>
                                          </div>
                                      </div>

                                      <div className="bg-slate-800 border border-slate-700 p-4 rounded">
                                          <h4 className="font-semibold mb-2 text-white">Combination Logic:</h4>
                                          <div className="space-y-2 text-gray-300">
                                              <p className="text-xs">Suggestions from different sources are merged and prioritized:</p>
                                              <ul className="list-disc list-inside ml-4 text-xs space-y-1">
                                                  <li><strong>Deduplication:</strong> Unique products are identified across all suggestion types.</li>
                                                  <li><strong>Confidence Blending:</strong> If a product appears in multiple suggestion types (e.g., Weekly and Collaborative), their confidence scores are blended with a 50/50 weighting.</li>
                                                  <li><strong>Reason Types:</strong> Products can have 'Weekly', 'Restock', 'Weekly+Restock', 'Collaborative', or 'Hybrid' (for blended suggestions) reasons.</li>
                                              </ul>
                                              <p className="text-xs mt-3"><strong>Prioritization Order:</strong> Weekly+Restock > Hybrid > Restock > Weekly > Collaborative (highest confidence wins within same priority)</p>
                                          </div>
                                      </div>
                                  </div>
                              </DialogContent>
                          </Dialog>
                      </div>
                      <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                              <Dialog open={showPreferencesDialog} onOpenChange={setShowPreferencesDialog}>
                                  <DialogTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                                          <Settings className="w-4 h-4 text-gray-500" />
                                      </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-sm">
                                      <DialogHeader>
                                          <DialogTitle>Suggestion Preferences</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-6 py-4">
                                          <div>
                                              <div className="flex justify-between items-center mb-2">
                                                  <label className="text-sm font-medium">Weekly/Restock Weight</label>
                                                  <span className="text-sm text-gray-500">{(weeklyWeight * 100).toFixed(0)}%</span>
                                              </div>
                                              <Slider
                              value={[weeklyWeight]}
                              onValueChange={([val]) => {
                                setWeeklyWeight(val);
                                setCollaborativeWeight(parseFloat((1 - val).toFixed(1)));
                              }}
                              min={0}
                              max={1}
                              step={0.1} />

                                          </div>
                                          <div>
                                              <div className="flex justify-between items-center mb-2">
                                                  <label className="text-sm font-medium">Collaborative Weight</label>
                                                  <span className="text-sm text-gray-500">{(collaborativeWeight * 100).toFixed(0)}%</span>
                                              </div>
                                              <Slider
                              value={[collaborativeWeight]}
                              onValueChange={([val]) => {
                                setCollaborativeWeight(val);
                                setWeeklyWeight(parseFloat((1 - val).toFixed(1)));
                              }}
                              min={0}
                              max={1}
                              step={0.1} />

                                          </div>
                                          <Button onClick={() => {
                            refreshSuggestions();
                            setShowPreferencesDialog(false);
                          }} className="w-full">
                                              Apply & Refresh
                                          </Button>
                                      </div>
                                  </DialogContent>
                              </Dialog>
                              <Button
                      size="sm"
                      variant="outline"
                      onClick={refreshSuggestions}
                      disabled={refreshingSuggestions}
                      className="h-8 text-xs">
                                  <RefreshCw className={`w-3 h-3 mr-1 ${refreshingSuggestions ? 'animate-spin' : ''}`} />
                                  Refresh
                              </Button>
                          </div>
                          {suggestions?.items?.length > 0 &&
                  <Badge variant="outline" className="bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                              {suggestions.items.length} items
                          </Badge>
                  }
                      </div>
                  </div>
              </CardHeader>
              {showSuggestions && <CardContent>
                  {loadingSuggestions ?
              <div className="flex items-center justify-center py-8 text-gray-500">
                          <Loader2 className="w-6 h-6 animate-spin mr-2" />
                          <span>Generating suggestions...</span>
                      </div> :
              !suggestions?.items?.length ?
              <div className="text-center py-8 text-gray-500">
                          <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                          <p className="mb-2">No AI suggestions available yet</p>
                          <p className="text-xs text-gray-400">Click refresh to generate personalized suggestions</p>
                      </div> :

              <div className="space-y-3">
                      {suggestions.items.slice(0, showAllSuggestions ? undefined : 6).map((item, idx) =>
                <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                           <span className="font-semibold text-gray-900 dark:text-gray-100">{item.product_name}</span>
                                           <Badge className={`text-[10px] px-1.5 py-0 h-5 flex items-center gap-1 border ${
                        item.reason_type === 'Weekly+Restock' ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800' :
                        item.reason_type === 'Collaborative' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' :
                        item.reason_type === 'Hybrid' ? 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800' :
                        item.reason_type === 'Restock' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' :
                        'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'}`
                        }>
                                               {item.reason_type}
                                           </Badge>
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
                        className="text-[10px] text-indigo-500 flex items-center gap-1 mt-2 hover:underline">

                                          Why? {expandedSuggestion === idx ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                      {expandedSuggestion === idx &&
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 dark:bg-gray-700 p-3 rounded space-y-2">
                                              {item.reason_type.includes('Weekly') &&
                        <p className="text-gray-700 dark:text-gray-300">You bought this <span className="font-semibold">{item.evidence.occurrences} times</span> on this weekday in the last <span className="font-semibold">{item.evidence.n_weeks} weeks</span>.</p>
                        }
                                              {item.reason_type.includes('Restock') &&
                        <>
                                                      <p className="font-semibold text-gray-800 dark:text-gray-200">Restock Recommendation</p>
                                                      <p className="text-gray-700 dark:text-gray-300">Based on your buying patterns:</p>
                                                      <p className="text-gray-600 dark:text-gray-300">• Average purchase every <span className="font-semibold">{Number(item.evidence?.avg_cadence_days || 0).toFixed(0)} days</span></p>
                                                      <p className="text-gray-600 dark:text-gray-300">• Last purchased <span className="font-semibold">{Number(item.evidence?.days_since_last_purchase || 0)} days ago</span></p>
                                                      <p className="text-amber-600 dark:text-amber-400 font-semibold mt-1">You're {item.evidence?.avg_cadence_days ? (Number(item.evidence.days_since_last_purchase || 0) / Number(item.evidence.avg_cadence_days)).toFixed(1) : '?'}x through your cycle - time to restock!</p>
                                                  </>
                        }
                                              {item.reason_type.includes('Collaborative') &&
                        <>
                                                      <p className="font-semibold text-gray-800 dark:text-gray-200">Community Favorite</p>
                                                      <p className="text-gray-700 dark:text-gray-300">
                                                          Popular among <span className="font-semibold">{item.evidence?.similar_users_count || 1} users</span> with similar shopping habits to yours.
                                                      </p>
                                                  </>
                        }
                                              {item.reason_type.includes('Hybrid') &&
                        <>
                                                      <p className="font-semibold text-gray-800 dark:text-gray-200">Hybrid Recommendation</p>
                                                      <p className="text-gray-700 dark:text-gray-300">
                                                          Combined insights from your weekly habits and community trends.
                                                      </p>
                                                      {item.evidence?.collaborative_evidence &&
                          <p className="text-xs text-gray-500 mt-1">
                                                              Also popular with {item.evidence.collaborative_evidence.similar_users_count} similar shoppers.
                                                          </p>
                          }
                                                  </>
                        }
                                          </div>
                      }
                                  </div>
                                  <div className="flex flex-col gap-2 items-center">
                                      <Button
                        size="sm"
                        className={`h-8 w-8 p-0 mb-1 transition-all duration-300 ${
                          addedItems.has(item.product_id) 
                            ? 'bg-green-500 hover:bg-green-600 scale-110' 
                            : 'bg-indigo-600 hover:bg-indigo-700'
                        }`}
                        onClick={async () => {
                          // Fetch all products with this GTIN to get prices from all chains
                          const allVariants = await base44.entities.Product.filter({ gtin: item.product_id }, '-updated_date', 100);
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
                          
                          // Always use addToCartWithPrices to ensure prices are stored
                          addToCartWithPrices({ gtin: item.product_id, canonical_name: item.product_name }, pricesByChain, true);
                          
                          setAddedItems(prev => new Set([...prev, item.product_id]));
                          setTimeout(() => {
                            setAddedItems(prev => {
                              const next = new Set(prev);
                              next.delete(item.product_id);
                              return next;
                            });
                          }, 1500);
                        }}>

                                          {addedItems.has(item.product_id) ? <CheckCircle className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                      </Button>
                                      <div className="flex gap-1">
                                          <Button
                          size="sm"
                          variant="ghost"
                          className={`h-6 w-6 p-0 ${likedItems.has(item.product_id) ? 'bg-green-100 hover:bg-green-200' : 'hover:bg-green-50'}`}
                          onClick={() => handlePreference(item, 'like')}>

                                              <ThumbsUp className={`w-3 h-3 ${likedItems.has(item.product_id) ? 'text-green-700 fill-current' : 'text-green-600'}`} />
                                          </Button>
                                          <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 hover:bg-red-50"
                          onClick={() => handlePreference(item, 'dislike')}
                          disabled={likedItems.has(item.product_id)}>

                                              <ThumbsDown className={`w-3 h-3 ${likedItems.has(item.product_id) ? 'text-gray-300' : 'text-red-600'}`} />
                                          </Button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                )}
                          </div>
              }

                  {suggestions?.items?.length > 0 &&
              <>
                      <div className="mt-4 flex gap-3">
                          <Button
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => {
                      suggestions.items.forEach((item) => {
                        const existing = cartItems.find((i) => i.gtin === item.product_id);
                        if (existing) {
                          setCartItems(cartItems.map((i) =>
                          i.gtin === item.product_id ?
                          { ...i, quantity: i.quantity + item.suggested_qty } :
                          i
                          ));
                        } else {
                          setCartItems((prev) => [...prev, {
                            gtin: item.product_id,
                            name: item.product_name,
                            quantity: item.suggested_qty || 1
                          }]);
                        }
                      });
                      toast.success(`Added ${suggestions.items.length} items to cart`);
                    }}>
                              Add All to Cart
                          </Button>
                          <Button
                    variant="outline"
                    className="text-gray-500"
                    onClick={async () => {
                      try {
                        await base44.entities.SuggestedCartDraft.update(suggestions.id, { status: 'dismissed' });
                        setSuggestions(null);
                      } catch (e) {console.error(e);}
                    }}>
                              Dismiss
                          </Button>
                      </div>
                      {suggestions.items.length > 6 &&
                <div className="text-center mt-2">
                            <button
                    className="text-xs text-gray-500 hover:text-indigo-600"
                    onClick={() => setShowAllSuggestions(!showAllSuggestions)}>
                                {showAllSuggestions ? 'Show Less' : `Show ${suggestions.items.length - 6} More`}
                            </button>
                        </div>
                }
                    </>
              }
              </CardContent>
              }
          </Card>
        </TooltipProvider>
      }

              {/* Enhanced Product Search */}
              <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Add Products to Cart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EnhancedProductSearch onAddToCart={addToCart} onAddToCartWithPrices={addToCartWithPrices} />
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
                {editingCartId && (
                  <div className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <span>✏️ Editing: {cartName}</span>
                    <button onClick={() => { setEditingCartId(null); setCartName(''); }} className="text-red-500 hover:underline ml-2">Cancel</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {bestChains.length > 0 && (
                <div className="text-right">
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">
                    ₪{bestChains[0].totalCost?.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">{bestChains[0].chain?.name}</div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {cartItems.length > 0 &&
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setShowSaveDialog(true)}>
                {editingCartId ? 'Update Cart' : 'Save Cart'}
              </Button>
            }
            <Button variant="outline" className="flex-1" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide' : 'My Lists'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Dialog */}
      {showSaveDialog &&
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-slate-950 text-lg font-semibold tracking-tight">
              {editingCartId ? 'Update Cart' : 'Save Cart List'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              placeholder="Enter cart name (e.g., Weekly Groceries)"
              value={cartName}
              onChange={(e) => setCartName(e.target.value)} 
              className="text-slate-950 px-4 py-2 rounded-lg w-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500" 
            />
            {bestChains.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-green-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Best chain:</span>
                  <span className="font-semibold text-gray-900">{bestChains[0].chain?.name}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600">Estimated total:</span>
                  <span className="font-bold text-green-700 text-lg">₪{bestChains[0].totalCost?.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Price Comparison Table */}
            {cartItems.length > 0 && Object.keys(cartItemPrices).length > 0 && (() => {
              // Get all unique chain IDs that have prices for any cart item
              const allChainIds = new Set();
              Object.values(cartItemPrices).forEach(prices => {
                Object.keys(prices).forEach(chainId => allChainIds.add(chainId));
              });
              const chainIds = Array.from(allChainIds);
              const chainsInTable = chainIds.map(id => chains.find(c => c.id === id)).filter(Boolean);

              if (chainsInTable.length === 0) return null;

              return (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left p-2 font-semibold text-gray-700 sticky left-0 bg-gray-50">Product</th>
                          {chainsInTable.map(chain => (
                            <th key={chain.id} className="text-center p-2 font-semibold text-gray-700 min-w-[80px]">
                              {chain.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cartItems.map((item, idx) => {
                          const itemPricesForGtin = cartItemPrices[item.gtin] || {};
                          const prices = chainIds.map(chainId => itemPricesForGtin[chainId]?.price);
                          const validPrices = prices.filter(p => p != null);
                          const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                          const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

                          return (
                            <tr key={item.gtin} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="p-2 font-medium text-gray-900 sticky left-0 bg-inherit max-w-[150px] truncate" title={item.name}>
                                {item.name}
                                {item.quantity > 1 && <span className="text-gray-500 text-xs ml-1">×{item.quantity}</span>}
                              </td>
                              {chainIds.map(chainId => {
                                const price = itemPricesForGtin[chainId]?.price;
                                const isMin = price != null && price === minPrice && minPrice !== maxPrice;
                                const isMax = price != null && price === maxPrice && minPrice !== maxPrice;

                                return (
                                  <td 
                                    key={chainId} 
                                    className={`text-center p-2 font-medium ${
                                      isMin ? 'bg-green-100 text-green-700' : 
                                      isMax ? 'bg-red-100 text-red-700' : 
                                      'text-gray-600'
                                    }`}
                                  >
                                    {price != null ? `₪${price.toFixed(2)}` : '-'}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {/* Total Row */}
                        <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                          <td className="p-2 text-gray-900 sticky left-0 bg-gray-100">Total</td>
                          {chainIds.map(chainId => {
                            let total = 0;
                            let hasAllItems = true;
                            cartItems.forEach(item => {
                              const price = cartItemPrices[item.gtin]?.[chainId]?.price;
                              if (price != null) {
                                total += price * item.quantity;
                              } else {
                                hasAllItems = false;
                              }
                            });

                            const allTotals = chainIds.map(cid => {
                              let t = 0;
                              let valid = true;
                              cartItems.forEach(item => {
                                const p = cartItemPrices[item.gtin]?.[cid]?.price;
                                if (p != null) t += p * item.quantity;
                                else valid = false;
                              });
                              return valid ? t : null;
                            }).filter(t => t != null);

                            const minTotal = allTotals.length > 0 ? Math.min(...allTotals) : null;
                            const maxTotal = allTotals.length > 0 ? Math.max(...allTotals) : null;
                            const isMinTotal = hasAllItems && total === minTotal && minTotal !== maxTotal;
                            const isMaxTotal = hasAllItems && total === maxTotal && minTotal !== maxTotal;

                            return (
                              <td 
                                key={chainId} 
                                className={`text-center p-2 ${
                                  isMinTotal ? 'bg-green-200 text-green-800' : 
                                  isMaxTotal ? 'bg-red-200 text-red-800' : 
                                  'text-gray-700'
                                }`}
                              >
                                {hasAllItems ? `₪${total.toFixed(2)}` : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowSaveDialog(false); setEditingCartId(null); setCartName(''); }}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={saveCart} disabled={saving || !cartName.trim()}>
                {saving ? 'Saving...' : editingCartId ? 'Update' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
        }

      {/* Saved Carts History */}
      {showHistory &&
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved Cart Lists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedCarts.length === 0 ?
            <p className="text-center text-gray-400 py-6">No saved carts yet</p> :

            savedCarts.map((cart) => {
              // Calculate best chains from saved cart data
              const savedChainTotals = {};
              cart.items?.forEach(item => {
                const itemChainPrices = item.chainPrices || {};
                Object.entries(itemChainPrices).forEach(([chainId, data]) => {
                  if (!savedChainTotals[chainId]) {
                    savedChainTotals[chainId] = { total: 0, itemCount: 0 };
                  }
                  savedChainTotals[chainId].total += data.price * item.quantity;
                  savedChainTotals[chainId].itemCount++;
                });
              });

              const savedBestChains = Object.entries(savedChainTotals)
                .filter(([_, data]) => data.itemCount === cart.items?.length)
                .map(([chainId, data]) => ({
                  chain_id: chainId,
                  chain: chains.find(c => c.id === chainId),
                  totalCost: data.total,
                  itemCount: data.itemCount
                }))
                .sort((a, b) => a.totalCost - b.totalCost)
                .slice(0, 3);

              return (
                <div key={cart.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-gray-100">{cart.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {cart.total_items} items • Created {new Date(cart.created_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => loadSavedCart(cart)}>
                          Load
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => editSavedCart(cart)}>
                          ✏️
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSavedCart(cart.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                      {cart.items?.some(item => item.chainPrices && Object.keys(item.chainPrices).length > 0) && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                          onClick={() => setShowPriceCompare(showPriceCompare === cart.id ? null : cart.id)}
                        >
                          <TrendingDown className="w-3 h-3 mr-1" />
                          {showPriceCompare === cart.id ? 'Hide' : 'Compare'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Price comparison table from stored data */}
                  {showPriceCompare === cart.id && cart.items?.some(item => item.chainPrices && Object.keys(item.chainPrices).length > 0) && (() => {
                    // Get all unique chain IDs from saved cart items
                    const allChainIds = new Set();
                    cart.items.forEach(item => {
                      if (item.chainPrices) {
                        Object.keys(item.chainPrices).forEach(chainId => allChainIds.add(chainId));
                      }
                    });
                    const chainIds = Array.from(allChainIds);
                    const chainsInTable = chainIds.map(id => chains.find(c => c.id === id)).filter(Boolean);

                    if (chainsInTable.length === 0) return null;

                    return (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                          <TrendingDown className="w-3 h-3 text-green-600" /> Price Comparison:
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                  <th className="text-left p-1.5 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700">Product</th>
                                  {chainsInTable.map(chain => (
                                    <th key={chain.id} className="text-center p-1.5 font-semibold text-gray-700 dark:text-gray-300 min-w-[70px]">
                                      {chain.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {cart.items.map((item, idx) => {
                                  const itemChainPrices = item.chainPrices || {};
                                  const prices = chainIds.map(chainId => itemChainPrices[chainId]?.price);
                                  const validPrices = prices.filter(p => p != null);
                                  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                                  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;

                                  return (
                                    <tr key={item.gtin} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}>
                                      <td className="p-1.5 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-inherit max-w-[120px] truncate" title={item.name}>
                                        {item.name}
                                        {item.quantity > 1 && <span className="text-gray-500 text-[10px] ml-1">×{item.quantity}</span>}
                                      </td>
                                      {chainIds.map(chainId => {
                                        const price = itemChainPrices[chainId]?.price;
                                        const isMin = price != null && price === minPrice && minPrice !== maxPrice;
                                        const isMax = price != null && price === maxPrice && minPrice !== maxPrice;

                                        return (
                                          <td 
                                            key={chainId} 
                                            className={`text-center p-1.5 font-medium ${
                                              isMin ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 
                                              isMax ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' : 
                                              'text-gray-600 dark:text-gray-400'
                                            }`}
                                          >
                                            {price != null ? `₪${price.toFixed(2)}` : '-'}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                                {/* Total Row */}
                                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 font-bold">
                                  <td className="p-1.5 text-gray-900 dark:text-gray-100 sticky left-0 bg-gray-100 dark:bg-gray-700">Total</td>
                                  {chainIds.map(chainId => {
                                    let total = 0;
                                    let hasAllItems = true;
                                    cart.items.forEach(item => {
                                      const price = item.chainPrices?.[chainId]?.price;
                                      if (price != null) {
                                        total += price * item.quantity;
                                      } else {
                                        hasAllItems = false;
                                      }
                                    });

                                    const allTotals = chainIds.map(cid => {
                                      let t = 0;
                                      let valid = true;
                                      cart.items.forEach(item => {
                                        const p = item.chainPrices?.[cid]?.price;
                                        if (p != null) t += p * item.quantity;
                                        else valid = false;
                                      });
                                      return valid ? t : null;
                                    }).filter(t => t != null);

                                    const minTotal = allTotals.length > 0 ? Math.min(...allTotals) : null;
                                    const maxTotal = allTotals.length > 0 ? Math.max(...allTotals) : null;
                                    const isMinTotal = hasAllItems && total === minTotal && minTotal !== maxTotal;
                                    const isMaxTotal = hasAllItems && total === maxTotal && minTotal !== maxTotal;

                                    return (
                                      <td 
                                        key={chainId} 
                                        className={`text-center p-1.5 ${
                                          isMinTotal ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200' : 
                                          isMaxTotal ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' : 
                                          'text-gray-700 dark:text-gray-300'
                                        }`}
                                      >
                                        {hasAllItems ? `₪${total.toFixed(2)}` : '-'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Show items preview */}
                  <div className="text-xs text-gray-500 mt-3 flex flex-wrap gap-1">
                    {cart.items?.slice(0, 5).map((item, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0 bg-white dark:bg-gray-700">
                        {item.name?.substring(0, 20)}{item.name?.length > 20 ? '...' : ''}
                      </Badge>
                    ))}
                    {cart.items?.length > 5 && (
                      <Badge variant="outline" className="text-[10px] py-0 bg-gray-100">
                        +{cart.items.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
            }
          </CardContent>
        </Card>
        }



      {/* Cart Items List */}
      {cartItems.length === 0 ?
        <Card>
          <CardContent className="p-10 text-center text-gray-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Your cart is empty. Add products to compare prices!</p>
          </CardContent>
        </Card> :

        <>
          {/* Cart Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Cart Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartItems.map((item) => {
                const itemChainPrices = cartItemPrices[item.gtin] || {};
                const priceEntries = Object.entries(itemChainPrices)
                  .map(([chainId, data]) => ({
                    chainId,
                    chain: chains.find(c => c.id === chainId),
                    price: data.price
                  }))
                  .sort((a, b) => a.price - b.price);
                const cheapestPrice = priceEntries.length > 0 ? priceEntries[0].price : null;

                return (
                  <div key={item.gtin} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                          {item.quantity}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            {item.name}
                            {item.fromSuggestion && (
                              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800">
                                <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                                Suggested
                              </Badge>
                            )}
                          </div>
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
                          defaultIssueType="price" />
                      </div>
                    </div>

                    {/* Prices from different chains */}
                    {priceEntries.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-500 mb-1">Prices by chain:</div>
                        <div className="flex flex-wrap gap-2">
                          {priceEntries.slice(0, 5).map((entry, idx) => (
                            <Badge 
                              key={entry.chainId} 
                              variant="outline" 
                              className={`text-[10px] px-2 py-0.5 ${
                                idx === 0 
                                  ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400' 
                                  : 'bg-white dark:bg-gray-700'
                              }`}
                            >
                              {entry.chain?.name || 'Unknown'}: ₪{entry.price.toFixed(2)}
                              {idx === 0 && ' ✓'}
                            </Badge>
                          ))}
                          {priceEntries.length > 5 && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                              +{priceEntries.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Store Comparisons */}
          {loadingComparisons ?
          <Card>
              <CardContent className="p-10 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
                <p className="text-sm">Comparing prices across supermarkets...</p>
              </CardContent>
            </Card> :
          storeComparisons.length > 0 ?
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <TrendingDown className="w-6 h-6 text-green-600" />
                    Top 3 Cheapest Supermarkets
                  </h3>
                  <Dialog>
                      <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                              <HelpCircle className="h-4 w-4 mr-1" />
                              How it works
                          </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                  <TrendingDown className="w-5 h-5 text-green-600" />
                                  Price Comparison - Technical Details
                              </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 text-sm">
                              <div>
                                  <h4 className="font-semibold mb-2">Process (getCartRecommendations):</h4>
                                  <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                      <li>Receives cart items (GTIN + quantity)</li>
                                      <li>Finds all Products matching GTINs across all chains</li>
                                      <li>Groups products by chain_id</li>
                                      <li>Calculates total cost per chain</li>
                                      <li>Ranks chains by total cost (ascending)</li>
                                      <li>Returns top 3 cheapest options</li>
                                  </ol>
                              </div>
                              
                              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                                  <h4 className="font-semibold mb-2 text-green-900 dark:text-green-200">Cost Calculation:</h4>
                                  <div className="bg-white dark:bg-gray-800 p-3 rounded text-xs font-mono">
                                      <p className="mb-2">For each chain:</p>
                                      <code className="text-gray-700 dark:text-gray-300">
                                          totalCost = Σ (item.current_price × item.quantity)<br />
                                          availableItems = count(matched products)<br />
                                          missingItems = cart.length - availableItems
                                      </code>
                                  </div>
                              </div>
                              
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                  <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">Location Integration:</h4>
                                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">If user location provided (lat/lon):</p>
                                  <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                      <li>Finds nearest Store for each chain using Haversine distance</li>
                                      <li>Fetches driving route from OSRM (Open Source Routing Machine)</li>
                                      <li>Optionally fetches transit route if available</li>
                                      <li>Displays distance, duration, and branch address</li>
                                  </ul>
                              </div>
                              
                              <div className="bg-violet-50 dark:bg-violet-900/20 p-3 rounded">
                                  <h4 className="font-semibold mb-2 text-violet-900 dark:text-violet-200">Smart Cart Optimization:</h4>
                                  <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">Multi-store split algorithm:</p>
                                  <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                      <li>For each cart item, finds the chain with lowest price</li>
                                      <li>Creates optimized cart splitting items across stores</li>
                                      <li>Calculates total savings vs. single-store shopping</li>
                                      <li>Shows breakdown of which items to buy where</li>
                                  </ul>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">Note: Doesn't account for travel costs between stores</p>
                              </div>
                          </div>
                      </DialogContent>
                  </Dialog>
              </div>
              {storeComparisons.map((comparison, idx) =>
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
                        {comparison.nearestBranch &&
                    <div className="mt-2 space-y-1">
                            <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <StoreIcon className="w-4 h-4" />
                              {comparison.nearestBranch.city || comparison.nearestBranch.address_line}
                              {!comparison.drivingInfo && comparison.distance &&
                        <span className="text-gray-500 ml-2">• {comparison.distance.toFixed(1)} km (linear)</span>
                        }
                            </div>
                            
                            {comparison.drivingInfo &&
                      <div className="text-xs text-gray-600 flex items-center gap-3">
                                    <div className="flex items-center gap-1" title="Driving">
                                        <Car className="w-3 h-3 text-indigo-600" />
                                        <span>{comparison.drivingInfo.duration} ({comparison.drivingInfo.distance})</span>
                                    </div>
                                    {comparison.transitInfo &&
                        <div className="flex items-center gap-1" title="Public Transport">
                                            <Bus className="w-3 h-3 text-indigo-600" />
                                            <span>{comparison.transitInfo.duration}</span>
                                        </div>
                        }
                                </div>
                      }
                          </div>
                    }
                        {comparison.availableItems !== cartItems.length &&
                    <div className="text-xs text-amber-600 mt-2">
                            ⚠️ Only {comparison.availableItems} of {cartItems.length} items available
                          </div>
                    }
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">₪{comparison.totalCost.toFixed(2)}</div>
                        {idx > 0 && storeComparisons[0] &&
                    <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                            +₪{(comparison.totalCost - storeComparisons[0].totalCost).toFixed(2)} more
                          </div>
                    }
                      </div>
                    </div>
                  </CardContent>
                  </Card>
            )}

                  {/* Optimization Suggestion */}
                  {optimizedCart &&
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
                             {Array.from(new Set(optimizedCart.items.map((i) => i.store?.name))).map((storeName) =>
                      <div key={storeName} className="flex items-center justify-between text-sm p-3 rounded-lg border border-gray-100 bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <StoreIcon className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium text-gray-700">{storeName}</span>
                                    </div>
                                    <Badge variant="secondary" className="bg-white shadow-sm text-gray-600">
                                        {optimizedCart.items.filter((i) => i.store?.name === storeName).length} items
                                    </Badge>
                                </div>
                      )}
                           </div>
                        </div>

                        <Button
                    className="w-full mt-6 bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200 h-12 text-base"
                    onClick={applyOptimizedCart}>

                            <Sparkles className="w-5 h-5 mr-2" /> Apply Optimized Cart
                        </Button>
                      </div>
                  </div>
                  </div>
            }

                  </div> :

          <Card>
              <CardContent className="p-10 text-center text-gray-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No price data available for comparison</p>
              </CardContent>
            </Card>
          }
        </>
        }
      </div>
    </div>);

}