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
import { ShoppingCart, Plus, Trash2, RefreshCw, Store as StoreIcon, TrendingDown, Sparkles, CheckCircle, AlertCircle, Leaf, Heart, Tag, Car, Bus, Split, ArrowRight, Clock, CalendarDays, ChevronDown, ChevronUp, X, ShieldCheck, Search, Loader2, ThumbsUp, ThumbsDown, HelpCircle, Settings, MapPin, Save, List, ArrowLeftRight, PackagePlus, BookOpen } from 'lucide-react';
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CartAlternatives from '@/components/CartAlternatives';
import DataCorrectionDialog from '@/components/DataCorrectionDialog';
import AlternativeProductSelector from '@/components/AlternativeProductSelector';
import FrequentItemsSmartCart from '@/components/FrequentItemsSmartCart';
import { processManager } from "@/components/processManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function SmartCart() {
  const [cartItems, setCartItems] = useState(() => {
    const saved = localStorage.getItem('smartCartItems');
    return saved ? JSON.parse(saved) : [];
  });
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
  const [cartItemPrices, setCartItemPrices] = useState(() => {
    const saved = localStorage.getItem('smartCartPrices');
    return saved ? JSON.parse(saved) : {};
  }); // Store all chain prices per gtin: { gtin: { chain_id: { price, chain_id, store_id } } }
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

  // Persist cart items and prices to localStorage
  useEffect(() => {
    localStorage.setItem('smartCartItems', JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    localStorage.setItem('smartCartPrices', JSON.stringify(cartItemPrices));
  }, [cartItemPrices]);
  const [addedItems, setAddedItems] = useState(new Set());
  const [showPriceCompare, setShowPriceCompare] = useState(null); // cart id to show price comparison
  const [alternativeSelector, setAlternativeSelector] = useState(null); // { cartId, itemGtin, chainId }

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

        // Update user vectors incrementally
        if (user?.email) {
        base44.functions.invoke('buildUserVectors', { userId: user.email, mode: 'incremental' })
          .then(() => console.log("User vectors updated"))
          .catch(e => console.error("Failed to update user vectors", e));
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
        <div className="absolute top-6 right-6 flex items-center gap-2">
             <Dialog>
                 <DialogTrigger asChild>
                     <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20 hover:text-white">
                         <HelpCircle className="h-5 w-5" />
                     </Button>
                 </DialogTrigger>
                 <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto dark:bg-gray-900">
                     <DialogHeader>
                         <DialogTitle className="flex items-center gap-2 text-xl">
                             <BookOpen className="w-5 h-5 text-indigo-600" />
                             Smart Cart Guide
                         </DialogTitle>
                     </DialogHeader>
                     <p className="text-sm text-gray-600 dark:text-gray-400 -mt-1 mb-4">
                         Everything you need to know about using Smart Cart effectively.
                     </p>
                     <div className="space-y-4 text-sm dark:text-gray-200">
                         
                         {/* Adding Items */}
                         <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800">
                             <h4 className="font-semibold mb-2 text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                                 <PackagePlus className="w-4 h-4 text-emerald-600" />
                                 Adding Items to Your Cart
                             </h4>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                 Build your shopping list by adding products manually or from suggestions.
                             </p>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li className="flex items-start gap-2">
                                     <span className="text-emerald-500 mt-0.5">✓</span>
                                     <span><strong>Search Products</strong> — Use the search bar to find any product by name or barcode</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-emerald-500 mt-0.5">✓</span>
                                     <span><strong>AI Suggestions</strong> — Add items from "Suggested for Today" with one tap</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-emerald-500 mt-0.5">✓</span>
                                     <span><strong>Most Purchased</strong> — Quickly add your frequently bought items from the collapsible section</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-emerald-500 mt-0.5">✓</span>
                                     <span><strong>Adjust Quantities</strong> — Use +/- buttons to change item quantities</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-emerald-500 mt-0.5">✓</span>
                                     <span><strong>Remove Items</strong> — Click the trash icon to remove items from your cart</span>
                                 </li>
                             </ul>
                         </div>

                         {/* Saving Carts */}
                         <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                             <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200 flex items-center gap-2">
                                 <Save className="w-4 h-4 text-blue-600" />
                                 Saving & Managing Cart Lists
                             </h4>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                 Save your cart for later or create multiple shopping lists.
                             </p>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li className="flex items-start gap-2">
                                     <span className="text-blue-500 mt-0.5">✓</span>
                                     <span><strong>Save Cart</strong> — Click "Save Cart" and give it a name (e.g., "Weekly Groceries")</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-blue-500 mt-0.5">✓</span>
                                     <span><strong>My Lists</strong> — Access all your saved carts from the "My Lists" button</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-blue-500 mt-0.5">✓</span>
                                     <span><strong>Load Cart</strong> — Reload a saved cart to edit or shop again</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-blue-500 mt-0.5">✓</span>
                                     <span><strong>Edit Cart</strong> — Click ✏️ to modify a saved cart and update it</span>
                                 </li>
                             </ul>
                         </div>

                         {/* Chain Comparison */}
                         <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800">
                             <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                 <TrendingDown className="w-4 h-4 text-amber-600" />
                                 Price Comparison Across Chains
                             </h4>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                 See which supermarket chain offers the best total price for your cart.
                             </p>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li className="flex items-start gap-2">
                                     <span className="text-amber-500 mt-0.5">✓</span>
                                     <span><strong>Auto Compare</strong> — Prices are compared automatically as you add items</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-amber-500 mt-0.5">✓</span>
                                     <span><strong>Top 3 Stores</strong> — See the 3 cheapest stores for your entire cart</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-amber-500 mt-0.5">✓</span>
                                     <span><strong>Compare Button</strong> — Click "Compare" on saved carts to see a detailed price table</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-amber-500 mt-0.5">✓</span>
                                     <span><strong>Color Coded</strong> — Green = cheapest, Red = most expensive for each item</span>
                                 </li>
                             </ul>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                 💡 The comparison table shows individual item prices AND total cart cost per chain.
                             </p>
                         </div>

                         {/* Alternative Items */}
                         <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-lg border border-violet-100 dark:border-violet-800">
                             <h4 className="font-semibold mb-2 text-violet-900 dark:text-violet-200 flex items-center gap-2">
                                 <ArrowLeftRight className="w-4 h-4 text-violet-600" />
                                 Choosing Alternative Items
                             </h4>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                 When a product isn't available at a chain, find a substitute with the same name.
                             </p>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li className="flex items-start gap-2">
                                     <span className="text-violet-500 mt-0.5">✓</span>
                                     <span><strong>Missing Items</strong> — Cells show "-" when an item isn't available at that chain</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-violet-500 mt-0.5">✓</span>
                                     <span><strong>Click to Add</strong> — Click any cell (even "-") to search for alternatives</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-violet-500 mt-0.5">✓</span>
                                     <span><strong>~alt Marker</strong> — Cells with dashed yellow border show an alternative product</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-violet-500 mt-0.5">✓</span>
                                     <span><strong>Auto-Saved</strong> — Your alternative selections are saved to the cart automatically</span>
                                 </li>
                             </ul>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                 💡 Different chains may have different GTINs for the same product — alternatives help complete your comparison.
                             </p>
                         </div>

                         {/* Smart Split */}
                         <div className="bg-pink-50 dark:bg-pink-900/20 p-4 rounded-lg border border-pink-100 dark:border-pink-800">
                             <h4 className="font-semibold mb-2 text-pink-900 dark:text-pink-200 flex items-center gap-2">
                                 <Split className="w-4 h-4 text-pink-600" />
                                 Smart Cart Split
                             </h4>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                 Save even more by splitting your cart across multiple stores.
                             </p>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li className="flex items-start gap-2">
                                     <span className="text-pink-500 mt-0.5">✓</span>
                                     <span><strong>Optimization</strong> — We calculate the cheapest store for each item</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-pink-500 mt-0.5">✓</span>
                                     <span><strong>Split Strategy</strong> — Shows which items to buy at which store</span>
                                 </li>
                                 <li className="flex items-start gap-2">
                                     <span className="text-pink-500 mt-0.5">✓</span>
                                     <span><strong>Apply Cart</strong> — Click "Apply Optimized Cart" to use the split strategy</span>
                                 </li>
                             </ul>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                 💡 Split suggestions appear when savings exceed 5% vs single-store shopping.
                             </p>
                         </div>

                         {/* Tips */}
                         <div className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                             <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                 <Sparkles className="w-4 h-4 text-slate-600" />
                                 Pro Tips
                             </h4>
                             <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                 <li>• <strong>Location:</strong> Allow location access to see nearest store branches</li>
                                 <li>• <strong>Suggestions:</strong> Use 👍👎 to personalize your AI suggestions</li>
                                 <li>• <strong>Report Issues:</strong> Use the flag icon to report incorrect prices</li>
                                 <li>• <strong>Refresh:</strong> Click "Refresh" on suggestions to get updated recommendations</li>
                             </ul>
                         </div>
                     </div>
                 </DialogContent>
             </Dialog>
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
                                          How Suggestions Work
                                      </DialogTitle>
                                  </DialogHeader>
                                  <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2 mb-4">
                                      We create a personalized shopping list based on your habits — so you never forget what you need.
                                  </p>
                                  <div className="space-y-4 text-sm dark:text-gray-200">
                                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                                          <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200 flex items-center gap-2">
                                              <CalendarDays className="w-4 h-4 text-blue-600" />
                                              Weekly Patterns
                                          </h4>
                                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                              Items you regularly buy on this day of the week.
                                          </p>
                                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                                              <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>How it works</strong> — We look at what you buy on Fridays, Sundays, etc.</div>
                                              <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Confidence</strong> — Based on how consistently you buy the item</div>
                                          </div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                              💡 <strong>Example:</strong> You bought milk on 6 out of 8 Fridays → suggested for this Friday!
                                          </p>
                                      </div>

                                      <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800">
                                          <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                              <RefreshCw className="w-4 h-4 text-amber-600" />
                                              Restock Reminders
                                          </h4>
                                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                              Items you're running low on based on your buying cycle.
                                          </p>
                                          <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                              <li className="flex items-start gap-2">
                                                  <span className="text-amber-500 mt-0.5">✓</span>
                                                  <span><strong>Learns your rhythm</strong> — Tracks how often you buy each product</span>
                                              </li>
                                              <li className="flex items-start gap-2">
                                                  <span className="text-amber-500 mt-0.5">✓</span>
                                                  <span><strong>Predicts when you'll run out</strong> — Suggests before you need it</span>
                                              </li>
                                          </ul>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                              💡 <strong>Example:</strong> You buy eggs every 7 days, last purchase was 6 days ago → time to restock!
                                          </p>
                                      </div>

                                      <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800">
                                          <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200 flex items-center gap-2">
                                              <Sparkles className="w-4 h-4 text-purple-600" />
                                              Community Favorites
                                          </h4>
                                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                              Products that shoppers like you often buy — discover new items!
                                          </p>
                                          <div className="space-y-2 text-xs">
                                              <div className="flex gap-2">
                                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-medium">🤝 Similar Shoppers</span>
                                                  <span className="text-gray-600 dark:text-gray-400">Found by matching shopping patterns</span>
                                              </div>
                                              <div className="flex gap-2">
                                                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-medium">🔍 New Discoveries</span>
                                                  <span className="text-gray-600 dark:text-gray-400">Items you haven't tried yet</span>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                                          <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                              <Settings className="w-4 h-4 text-slate-600" />
                                              Smart Prioritization
                                          </h4>
                                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                              We combine all signals and show you the most relevant items first.
                                          </p>
                                          <div className="flex flex-wrap gap-2 text-xs">
                                              <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">Weekly+Restock</Badge>
                                              <Badge className="bg-teal-100 text-teal-700 border-teal-200">Hybrid</Badge>
                                              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Restock</Badge>
                                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">Weekly</Badge>
                                              <Badge className="bg-purple-100 text-purple-700 border-purple-200">Community</Badge>
                                          </div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                              Items appearing in multiple categories get priority. Use 👍👎 to personalize further!
                                          </p>
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

              {/* Most Purchased Items */}
              <FrequentItemsSmartCart 
                onAddToCartWithPrices={addToCartWithPrices} 
                chains={chains} 
              />

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
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 mt-1"
                        onClick={async () => {
                          if (showPriceCompare === cart.id) {
                            setShowPriceCompare(null);
                          } else {
                            // Fetch prices if not stored
                            const needsPrices = cart.items?.some(item => !item.chainPrices || Object.keys(item.chainPrices).length === 0);
                            if (needsPrices) {
                              const gtins = cart.items.map(item => item.gtin);
                              try {
                                // First fetch by GTIN
                                const allProducts = await base44.entities.Product.filter({
                                  gtin: { $in: gtins }
                                }, '-updated_date', 500);
                                
                                const pricesByGtin = {};
                                allProducts.forEach(product => {
                                  if (product.chain_id && product.current_price != null) {
                                    if (!pricesByGtin[product.gtin]) {
                                      pricesByGtin[product.gtin] = {};
                                    }
                                    if (!pricesByGtin[product.gtin][product.chain_id] || 
                                        product.current_price < pricesByGtin[product.gtin][product.chain_id].price) {
                                      pricesByGtin[product.gtin][product.chain_id] = {
                                        price: product.current_price,
                                        chain_id: product.chain_id,
                                        store_id: product.store_id,
                                        isAlternative: false
                                      };
                                    }
                                  }
                                });
                                
                                // For items missing prices in some chains, search by name
                                const allChainIds = new Set();
                                Object.values(pricesByGtin).forEach(prices => {
                                  Object.keys(prices).forEach(chainId => allChainIds.add(chainId));
                                });
                                

                                
                                // For missing prices, search by exact name and pick cheapest per chain
                                for (const item of cart.items) {
                                  const itemPrices = pricesByGtin[item.gtin] || {};
                                  const missingChains = [...allChainIds].filter(chainId => !itemPrices[chainId]);

                                  if (missingChains.length > 0 && item.name) {
                                    // Search by exact canonical_name, sorted by price ascending
                                    const exactMatches = await base44.entities.Product.filter({
                                      canonical_name: item.name,
                                      chain_id: { $in: missingChains },
                                      gtin: { $ne: item.gtin }
                                    }, 'current_price', 200);

                                    // Group by chain and keep only the cheapest for each
                                    const cheapestByChain = {};
                                    exactMatches.forEach(alt => {
                                      if (alt.chain_id && alt.current_price != null) {
                                        if (!cheapestByChain[alt.chain_id] || alt.current_price < cheapestByChain[alt.chain_id].current_price) {
                                          cheapestByChain[alt.chain_id] = alt;
                                        }
                                      }
                                    });

                                    // Add cheapest alternatives to pricesByGtin
                                    Object.values(cheapestByChain).forEach(alt => {
                                      if (!pricesByGtin[item.gtin]) {
                                        pricesByGtin[item.gtin] = {};
                                      }
                                      pricesByGtin[item.gtin][alt.chain_id] = {
                                        price: alt.current_price,
                                        chain_id: alt.chain_id,
                                        store_id: alt.store_id,
                                        isAlternative: true,
                                        altName: alt.canonical_name,
                                        altGtin: alt.gtin
                                      };
                                    });
                                  }
                                }

                                // Update the cart in state with fetched prices
                                const updatedItems = cart.items.map(item => ({
                                  ...item,
                                  chainPrices: pricesByGtin[item.gtin] || item.chainPrices || {}
                                }));
                                setSavedCarts(prev => prev.map(c => 
                                  c.id === cart.id ? { ...c, items: updatedItems } : c
                                ));
                              } catch (error) {
                                console.error("Failed to fetch prices", error);
                              }
                            }
                            setShowPriceCompare(cart.id);
                          }
                        }}
                      >
                        <TrendingDown className="w-3 h-3 mr-1" />
                        {showPriceCompare === cart.id ? 'Hide' : 'Compare'}
                      </Button>
                    </div>
                  </div>

                  {/* Price comparison table from stored data */}
                  {showPriceCompare === cart.id && (() => {
                    // Get all unique chain IDs from saved cart items
                    const allChainIds = new Set();
                    cart.items.forEach(item => {
                      if (item.chainPrices) {
                        Object.keys(item.chainPrices).forEach(chainId => allChainIds.add(chainId));
                      }
                    });
                    const chainIds = Array.from(allChainIds);
                    const chainsInTable = chainIds.map(id => chains.find(c => c.id === id)).filter(Boolean);

                    if (chainsInTable.length === 0) return (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-center text-gray-500 text-sm py-4">
                        <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                        Loading prices...
                      </div>
                    );

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
                                  <th className="text-center p-1.5 font-semibold text-gray-700 dark:text-gray-300 min-w-[40px]">Qty</th>
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
                                    <tr key={item.gtin} className="bg-gray-900">
                                      <td className="p-1.5 font-medium text-gray-100 sticky left-0 bg-gray-900 max-w-[120px] truncate" title={item.name}>
                                        {item.name}
                                      </td>
                                      <td className="text-center p-1.5 text-gray-300">{item.quantity}</td>
                                      {chainIds.map(chainId => {
                                        const priceData = itemChainPrices[chainId];
                                        const price = priceData?.price;
                                        const isAlternative = priceData?.isAlternative;
                                        const isMin = price != null && price === minPrice && minPrice !== maxPrice;
                                        const isMax = price != null && price === maxPrice && minPrice !== maxPrice;

                                        return (
                                          <td 
                                            key={chainId} 
                                            className={`text-center p-1.5 font-medium relative ${
                                              isMin ? 'bg-green-900/60 text-green-400' : 
                                              isMax ? 'bg-red-900/60 text-red-400' : 
                                              'text-gray-400'
                                            } ${isAlternative ? 'border-2 border-dashed border-yellow-500' : ''} cursor-pointer hover:bg-gray-800`}
                                            title={isAlternative ? `Alternative: ${priceData.altName} - Click to change` : price == null ? 'Click to select alternative' : 'Click to change'}
                                            onClick={() => {
                                              setAlternativeSelector({
                                                cartId: cart.id,
                                                itemGtin: item.gtin,
                                                itemName: item.name,
                                                chainId: chainId
                                              });
                                            }}
                                          >
                                            {price != null ? (
                                              <span className="flex flex-col items-center">
                                                <span>₪{price.toFixed(2)}</span>
                                                {isAlternative && (
                                                  <span className="text-[8px] text-yellow-400 font-normal">~alt</span>
                                                )}
                                              </span>
                                            ) : (
                                              <span className="text-yellow-500 text-[10px]">+ Add</span>
                                            )}

                                            {/* Alternative selector popup */}
                                            {alternativeSelector?.cartId === cart.id && 
                                             alternativeSelector?.itemGtin === item.gtin && 
                                             alternativeSelector?.chainId === chainId && (
                                              <AlternativeProductSelector
                                                itemName={item.name}
                                                itemGtin={item.gtin}
                                                chainId={chainId}
                                                chainName={chainsInTable.find(c => c.id === chainId)?.name || 'Unknown'}
                                                onClose={() => setAlternativeSelector(null)}
                                                onSelect={async (product) => {
                                                  // Update the cart's chainPrices for this item
                                                  const updatedItems = cart.items.map(i => {
                                                    if (i.gtin !== item.gtin) return i;
                                                    return {
                                                      ...i,
                                                      chainPrices: {
                                                        ...i.chainPrices,
                                                        [chainId]: {
                                                          price: product.current_price,
                                                          chain_id: chainId,
                                                          store_id: product.store_id,
                                                          isAlternative: true,
                                                          altName: product.canonical_name,
                                                          altGtin: product.gtin
                                                        }
                                                      }
                                                    };
                                                  });
                                                  
                                                  // Update local state
                                                  setSavedCarts(prev => prev.map(c => 
                                                    c.id === cart.id ? { ...c, items: updatedItems } : c
                                                  ));
                                                  
                                                  // Persist to database
                                                  try {
                                                    await base44.entities.SavedCart.update(cart.id, { items: updatedItems });
                                                    toast.success("Alternative saved");
                                                  } catch (e) {
                                                    console.error("Failed to save alternative", e);
                                                  }
                                                  
                                                  setAlternativeSelector(null);
                                                }}
                                              />
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                                {/* Total Row */}
                                <tr className="border-t-2 border-gray-600 bg-gray-900 font-bold">
                                  <td className="p-1.5 text-gray-100 sticky left-0 bg-gray-900">Total</td>
                                  <td className="text-center p-1.5 text-gray-300">{cart.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
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
                                  How Price Comparison Works
                              </DialogTitle>
                          </DialogHeader>
                          <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2 mb-4">
                              Find the cheapest store for your entire cart — we compare prices across all supermarkets in real-time.
                          </p>
                          <div className="space-y-4 text-sm">
                              <div className="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                      <Search className="w-4 h-4 text-slate-600" />
                                      Instant Comparison
                                  </h4>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                      We scan prices across all stores and rank them by total cart cost.
                                  </p>
                                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                                      <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>All Stores</strong> — Prices from every supermarket chain</div>
                                      <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Top 3</strong> — Cheapest options for your cart</div>
                                      <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Item Check</strong> — Shows if items are missing at a store</div>
                                      <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Live Prices</strong> — Updated from store catalogs</div>
                                  </div>
                              </div>
                              
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                                  <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200 flex items-center gap-2">
                                      <MapPin className="w-4 h-4 text-blue-600" />
                                      Nearest Branch Finder
                                  </h4>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                      Allow location access to see the closest store for each chain.
                                  </p>
                                  <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                      <li className="flex items-start gap-2">
                                          <span className="text-blue-500 mt-0.5">✓</span>
                                          <span><strong>Distance & Time</strong> — Driving time to nearest branch</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                          <span className="text-blue-500 mt-0.5">✓</span>
                                          <span><strong>Address</strong> — Full store location shown</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                          <span className="text-blue-500 mt-0.5">✓</span>
                                          <span><strong>Public Transit</strong> — Bus/train time when available</span>
                                      </li>
                                  </ul>
                              </div>
                              
                              <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-lg border border-violet-100 dark:border-violet-800">
                                  <h4 className="font-semibold mb-2 text-violet-900 dark:text-violet-200 flex items-center gap-2">
                                      <Split className="w-4 h-4 text-violet-600" />
                                      Smart Cart Split
                                  </h4>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                      Save even more by shopping at multiple stores — we show you exactly where to buy each item.
                                  </p>
                                  <div className="space-y-2 text-xs">
                                      <div className="flex gap-2">
                                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-medium">💰 Maximum Savings</span>
                                          <span className="text-gray-600 dark:text-gray-400">Find cheapest price for each item</span>
                                      </div>
                                      <div className="flex gap-2">
                                          <span className="px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded font-medium">📋 Shopping List</span>
                                          <span className="text-gray-600 dark:text-gray-400">Shows which items to buy where</span>
                                      </div>
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                      💡 Split suggestions appear when savings exceed 5% vs single-store shopping.
                                  </p>
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