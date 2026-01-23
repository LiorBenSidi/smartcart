import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Database, Trash2, RefreshCw, Zap, HelpCircle, Brain, Clock, Settings, GitMerge } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SystemValidationPanel from '../components/SystemValidationPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { processManager } from "@/components/processManager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [productCount, setProductCount] = useState(0);
  const [storeCount, setStoreCount] = useState(0);
  const [trueCounts, setTrueCounts] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [processState, setProcessState] = useState(processManager.getState());
  const [batchDelay, setBatchDelay] = useState(15000); // ms delay between batches (needs time for rate limits to reset between users)
  const [maxHabitsPerBatch, setMaxHabitsPerBatch] = useState(25); // Max habits created per frontend call
  const [isMergingGtins, setIsMergingGtins] = useState(false);
  const [gtinMergeResults, setGtinMergeResults] = useState(null);
  const [gtinDuplicates, setGtinDuplicates] = useState(null);
  const [processingMerge, setProcessingMerge] = useState(null);

  useEffect(() => {
    const unsubscribe = processManager.subscribe(setProcessState);
    return unsubscribe;
  }, []);

  const checkAdmin = async () => {
      const user = await base44.auth.me();
      let isAdmin = user.role === 'admin';
      if (!isAdmin) {
          const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
          isAdmin = profiles.length > 0 && profiles[0].is_admin;
      }
      if (!isAdmin) {
          window.location.href = '/';
          return false;
      }
      return true;
  };

  const fetchTableData = async () => {
      // Fetch visible data for table/list
      const allReceipts = await base44.entities.Receipt.list();
      setReceipts(allReceipts);

      const allUsers = await base44.entities.User.list();
      const usersWithStats = allUsers.map((u) => ({
          ...u,
          receipts: allReceipts.filter((r) => r.created_by === u.email).length
      }));
      setUsers(usersWithStats);
  };

  const syncStats = async () => {
      setIsSyncing(true);
      try {
          const statsResponse = await base44.functions.invoke('getSystemStats');
          const statsData = statsResponse.data;
          
          setProductCount(statsData?.products || 0);
          setStoreCount(statsData?.stores || 0);
          setTrueCounts(statsData);
      } catch (error) {
          console.error("Failed to sync stats", error);
      } finally {
          setIsSyncing(false);
      }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const isAdmin = await checkAdmin();
        if (isAdmin) {
            await fetchTableData();
        }
      } catch (e) {
        console.error("Admin init error", e);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleDeleteAllReceipts = async () => {
    setIsDeleting(true);
    try {
      await base44.entities.Receipt.filter({}, '', 1000).then(async (allReceipts) => {
        for (const receipt of allReceipts) {
          await base44.entities.Receipt.delete(receipt.id);
        }
      });
      setReceipts([]);
      setShowConfirm(false);

      // Update user stats
      const updatedUsers = users.map((u) => ({ ...u, receipts: 0 }));
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Failed to delete receipts', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    try {
      // Delete in order to respect dependencies
      const allReceipts = await base44.entities.Receipt.list();
      for (const r of allReceipts) await base44.entities.Receipt.delete(r.id);

      const receiptItems = await base44.entities.ReceiptItem.list();
      for (const r of receiptItems) await base44.entities.ReceiptItem.delete(r.id);

      const receiptInsights = await base44.entities.ReceiptInsight.list();
      for (const r of receiptInsights) await base44.entities.ReceiptInsight.delete(r.id);

      const savedCarts = await base44.entities.SavedCart.list();
      for (const r of savedCarts) await base44.entities.SavedCart.delete(r.id);

      const productPrices = await base44.entities.ProductPrice.list();
      for (const r of productPrices) await base44.entities.ProductPrice.delete(r.id);

      const products = await base44.entities.Product.list();
      for (const r of products) await base44.entities.Product.delete(r.id);

      const promotions = await base44.entities.Promotion.list();
      for (const r of promotions) await base44.entities.Promotion.delete(r.id);

      const stores = await base44.entities.Store.list();
      for (const r of stores) await base44.entities.Store.delete(r.id);

      const chains = await base44.entities.Chain.list();
      for (const r of chains) await base44.entities.Chain.delete(r.id);

      setReceipts([]);
      setShowConfirm(false);

      const updatedUsers = users.map((u) => ({ ...u, receipts: 0 }));
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Failed to delete all data', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAnalyzeSentiment = async () => {
    try {
        await processManager.startProcess('analyzeStoreSentiment', { limit: 5 }, { delayMs: batchDelay });
    } catch (err) {
        console.error('Sentiment analysis failed:', err);
    }
  };

  const handleRebuildUserVectors = async () => {
    try {
        await processManager.startProcess('buildUserVectors', { limit: 10 }, { delayMs: batchDelay });
    } catch (err) {
        console.error('Vector rebuild failed:', err);
    }
  };

  const handleRebuildUserHabits = async () => {
    try {
        // Use 60 second delay between users to avoid rate limits
        await processManager.startProcess('rebuildUserHabits', { limit: 1, maxHabitsPerBatch }, { delayMs: 60000 });
    } catch (err) {
        console.error('Rebuild failed:', err);
    }
  };

  const handleScanGtinDuplicates = async () => {
    setIsMergingGtins(true);
    setGtinMergeResults(null);
    setGtinDuplicates(null);
    try {
      // Fetch all products in batches of 5000
      let allProducts = [];
      let skip = 0;
      const batchSize = 5000;
      
      while (true) {
        const batch = await base44.entities.Product.filter({}, '-updated_date', batchSize, skip);
        allProducts = [...allProducts, ...batch];
        if (batch.length < batchSize) break;
        skip += batchSize;
      }
      
      // Group products by canonical_name
      const productsByName = {};
      allProducts.forEach(product => {
        const name = product.canonical_name?.trim().toLowerCase();
        if (name) {
          if (!productsByName[name]) {
            productsByName[name] = [];
          }
          productsByName[name].push(product);
        }
      });
      
      // Helper function to compare allergen_tags arrays
      const arraysEqual = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, idx) => val === sortedB[idx]);
      };

      // Find duplicates (products with same name but different GTINs)
      const duplicates = [];
      for (const [name, products] of Object.entries(productsByName)) {
        const uniqueGtins = [...new Set(products.map(p => p.gtin))];
        if (uniqueGtins.length > 1) {
          // Count occurrences of each GTIN
          const gtinCounts = {};
          products.forEach(p => {
            gtinCounts[p.gtin] = (gtinCounts[p.gtin] || 0) + 1;
          });

          // Find the best GTIN (reference product)
          const sortedGtins = Object.entries(gtinCounts).sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            if (b[0].length !== a[0].length) return b[0].length - a[0].length;
            return b[0].localeCompare(a[0], undefined, { numeric: true });
          });

          const bestGtin = sortedGtins[0][0];
          const referenceProduct = products.find(p => p.gtin === bestGtin);

          // Only exclude products with SAME chain_id AND chain_item_code as reference
          const productsToUpdate = products.filter(p => {
            if (p.gtin === bestGtin) return false; // Skip reference product

            // Check for same chain_id AND chain_item_code (exact same product entry)
            if (p.chain_id && referenceProduct.chain_id && 
                p.chain_id === referenceProduct.chain_id &&
                p.chain_item_code && referenceProduct.chain_item_code &&
                p.chain_item_code === referenceProduct.chain_item_code) {
              return false; // Same chain + same item code = don't merge
            }

            return true; // Safe to merge
          });

          if (productsToUpdate.length > 0) {
            duplicates.push({ 
              name, 
              displayName: products[0].canonical_name,
              products, 
              gtins: uniqueGtins,
              bestGtin,
              productsToUpdate,
              gtinCounts
            });
          }
        }
      }
      
      if (duplicates.length === 0) {
        setGtinMergeResults({ message: "No duplicates found!", updated: 0 });
      } else {
        setGtinDuplicates(duplicates);
      }
      
    } catch (error) {
      console.error('Failed to scan GTINs', error);
      setGtinMergeResults({ message: "Error: " + error.message, updated: 0 });
    } finally {
      setIsMergingGtins(false);
    }
  };

  const handleApproveMerge = async (duplicate) => {
    setProcessingMerge(duplicate.name);
    try {
      for (const product of duplicate.productsToUpdate) {
        await base44.entities.Product.update(product.id, { gtin: duplicate.bestGtin });
      }
      
      // Remove from pending list
      setGtinDuplicates(prev => prev.filter(d => d.name !== duplicate.name));
      
      // Update results
      setGtinMergeResults(prev => ({
        message: `Merged ${(prev?.updated || 0) + duplicate.productsToUpdate.length} products`,
        updated: (prev?.updated || 0) + duplicate.productsToUpdate.length,
        details: [...(prev?.details || []), {
          name: duplicate.displayName,
          oldGtins: duplicate.gtins.filter(g => g !== duplicate.bestGtin),
          newGtin: duplicate.bestGtin,
          updatedCount: duplicate.productsToUpdate.length
        }]
      }));
    } catch (error) {
      console.error('Failed to merge', error);
    } finally {
      setProcessingMerge(null);
    }
  };

  const handleSkipMerge = (duplicate) => {
    setGtinDuplicates(prev => prev.filter(d => d.name !== duplicate.name));
  };

  const handleApproveAll = async () => {
    for (const duplicate of gtinDuplicates) {
      await handleApproveMerge(duplicate);
    }
  };

  if (isLoading) return <div className="p-10 text-center">Loading Admin Panel...</div>;

  return (
    <div className="space-y-6">
        <div className="bg-slate-800 dark:bg-slate-900 text-white p-6 rounded-2xl shadow-lg">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-emerald-400" />
                        Admin Console
                    </h1>
                    <p className="text-slate-300 text-sm mt-1">System Overview</p>
                </div>
                <Button 
                    onClick={syncStats} 
                    disabled={isSyncing}
                    variant="outline" 
                    className="bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600 hover:text-white"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Stats'}
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                <CardContent className="p-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Users</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {trueCounts ? trueCounts.users : <span className="text-sm font-normal text-slate-400 italic">Sync to view</span>}
                    </h3>
                </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                <CardContent className="p-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Receipts</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {trueCounts ? trueCounts.receipts : <span className="text-sm font-normal text-slate-400 italic">Sync to view</span>}
                    </h3>
                </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                <CardContent className="p-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Products</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {trueCounts ? trueCounts.products : <span className="text-sm font-normal text-slate-400 italic">Sync to view</span>}
                    </h3>
                </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                <CardContent className="p-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Stores</p>
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {trueCounts ? trueCounts.stores : <span className="text-sm font-normal text-slate-400 italic">Sync to view</span>}
                    </h3>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
                <Link to={createPageUrl('CatalogAdmin')} className="w-full">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                        <Database className="w-4 h-4 mr-2" /> Catalog Ingestion
                    </Button>
                </Link>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <HelpCircle className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-emerald-600" />
                                Catalog Ingestion - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">Process Overview:</h4>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Uploads compressed XML catalog file (.gz format)</li>
                                    <li>Decompresses and parses XML to extract product data</li>
                                    <li>Creates/updates Chain and Store records</li>
                                    <li>Bulk creates/updates Product entities (batches of 1000)</li>
                                    <li>Marks new products with enrichment_status='pending'</li>
                                    <li>Background job processes pending products for AI enrichment</li>
                                </ol>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">AI Enrichment (Background Job):</h4>
                                <p className="mb-2 text-gray-700 dark:text-gray-300">Products with enrichment_status='pending' are processed in batches of 50:</p>
                                <div className="bg-white dark:bg-gray-800 p-3 rounded text-xs font-mono">
                                    <p className="font-semibold mb-1">LLM Prompt:</p>
                                    <p className="text-gray-600 dark:text-gray-400">"Analyze these grocery products and provide:"</p>
                                    <ul className="list-disc list-inside ml-2 text-gray-700 dark:text-gray-300">
                                        <li>Category (Dairy, Meat, Produce, etc.)</li>
                                        <li>Kosher Level (none, basic_kosher, strict_kosher, glatt_kosher, mehadrin)</li>
                                        <li>Allergen Tags (Gluten, Nuts, Soy, Fish, etc.)</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Chain Information Enhancement:</h4>
                                <p className="text-gray-700 dark:text-gray-300">For new chains, uses LLM with internet search to find:</p>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300">
                                    <li>Website URL</li>
                                    <li>Logo image URL</li>
                                    <li>Chain description</li>
                                    <li>Chain type classification</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Store Location Discovery:</h4>
                                <p className="text-gray-700 dark:text-gray-300">Fetches branch locations from OpenStreetMap API and creates Store records with geocoded addresses.</p>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <Button 
                    onClick={handleAnalyzeSentiment}
                    disabled={processState.loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                    <Zap className="w-4 h-4 mr-2" />
                    {processState.loading && processState.activeProcess === 'analyzeStoreSentiment' ? 'Processing...' : 'Analyze Store Sentiment'}
                </Button>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <HelpCircle className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-blue-600" />
                                Store Sentiment Analysis - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">Analysis Process:</h4>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Fetches all stores and their reviews</li>
                                    <li>For each store with reviews, analyzes comments individually</li>
                                    <li>Calculates aggregate sentiment and statistics</li>
                                    <li>Creates/updates StoreSentiment records</li>
                                    <li>Aggregates to chain-level ChainSentiment</li>
                                </ol>
                            </div>

                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">LLM Sentiment Classification:</h4>
                                <p className="mb-2 text-gray-700 dark:text-gray-300">For each review comment:</p>
                                <div className="bg-white dark:bg-gray-800 p-3 rounded text-xs font-mono">
                                    <p className="font-semibold mb-1">LLM Prompt:</p>
                                    <p className="text-gray-600 dark:text-gray-400">"You are an expert sentiment analyst for grocery stores."</p>
                                    <p className="text-gray-600 dark:text-gray-400 mt-2">"Classify sentiment as positive (1) or negative (-1)"</p>
                                    <p className="text-gray-700 dark:text-gray-300 mt-2">Returns:</p>
                                    <ul className="list-disc list-inside ml-2 text-gray-700 dark:text-gray-300">
                                        <li>Sentiment score (1 or -1)</li>
                                        <li>Explanation (1-2 sentences)</li>
                                        <li>Key themes (cleanliness, staff, prices, etc.)</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Aggregation Logic:</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p><strong>Store Level:</strong></p>
                                    <ul className="list-disc list-inside ml-4">
                                        <li>Majority vote: More likes = positive, more dislikes = negative</li>
                                        <li>Sentiment score: Total likes minus dislikes</li>
                                        <li>Top 5 most mentioned themes across all reviews</li>
                                        <li>Average rating from star ratings (1-5)</li>
                                    </ul>
                                    <p className="mt-2"><strong>Chain Level:</strong></p>
                                    <ul className="list-disc list-inside ml-4">
                                        <li>Mean rating across all stores in chain</li>
                                        <li>Majority sentiment based on store counts</li>
                                        <li>Breakdown of positive/neutral/negative stores</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Rate Limiting:</h4>
                                <p className="text-gray-700 dark:text-gray-300">1000ms delay between stores, 500ms between reviews to avoid API rate limits. Stops after 1 consecutive error.</p>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <Button 
                    onClick={handleRebuildUserVectors}
                    disabled={processState.loading}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                >
                    <Brain className="w-4 h-4 mr-2" />
                    {processState.loading && processState.activeProcess === 'buildUserVectors' ? 'Processing...' : 'Rebuild User Vectors'}
                </Button>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <HelpCircle className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Brain className="w-5 h-5 text-purple-600" />
                                User Vectors - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">System Overview:</h4>
                                <p className="text-gray-700 dark:text-gray-300">Hybrid recommendation engine combining collaborative filtering and content-based analysis to suggest stores, categories, and products.</p>
                            </div>
                            
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">1. User Profile Vector Generation:</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs">Analyzes all available purchase history:</p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li><strong>Category preferences:</strong> Frequency distribution across product categories</li>
                                        <li><strong>Price sensitivity:</strong> avg_item_price, price_variance, discount_preference</li>
                                        <li><strong>Brand affinity:</strong> Ranked list of most purchased brands</li>
                                        <li><strong>Dietary signals:</strong> organic_ratio, kosher_ratio, health_conscious_ratio</li>
                                        <li><strong>Shopping behavior:</strong> basket_size, purchase_frequency, time_of_day</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">2. Collaborative Filtering (User Similarity):</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs">Finds "shopper twins" using cosine similarity:</p>
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded text-xs font-mono mt-1">
                                        <code className="text-gray-700 dark:text-gray-300">
                                            similarity = (V_user · V_other) / (||V_user|| × ||V_other||)<br/>
                                            where V = normalized preference vector
                                        </code>
                                    </div>
                                    <ul className="list-disc list-inside ml-4 text-xs mt-2">
                                        <li>Pre-computed similarity scores stored in SimilarUserEdge</li>
                                        <li>Selects top 10 most similar users (threshold: similarity ≥ 0.3)</li>
                                        <li>Extracts products/stores they bought that you haven't</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-green-900 dark:text-green-200">3. Candidate Scoring & Ranking:</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs"><strong>Product Recommendations:</strong></p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li>Collaborative score: Σ(similarity_weight × purchase_frequency)</li>
                                        <li>Category match bonus: +points if category in user's top 5</li>
                                        <li>Price appropriateness: Penalize if outside user's price range</li>
                                        <li>Recency boost: Newer products get slight advantage</li>
                                    </ul>
                                    <p className="text-xs mt-2"><strong>Store Recommendations:</strong></p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li>Based on chains where similar users shop</li>
                                        <li>Location bonus if user coordinates provided</li>
                                        <li>estimated_savings calculated from price comparisons</li>
                                    </ul>
                                    <p className="text-xs mt-2"><strong>Category Suggestions:</strong></p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li>Categories popular among similar users but new to you</li>
                                        <li>Sorted by aggregate similarity score</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">4. Insights Generation:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Smart Insights use rule-based heuristics:</p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>ShopperTwins:</strong> Highlights most similar user (e.g., "74% match with User X")</li>
                                    <li><strong>CategoryTrend:</strong> Detects if you're buying more of a category lately</li>
                                    <li><strong>BudgetAlert:</strong> Warns if spending above usual patterns</li>
                                </ul>
                            </div>
                            
                            <div>
                                <h4 className="font-semibold mb-2">5. Feedback Loop:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">User interactions (thumbs up/down, add to cart, dismiss) are logged to RecommendationFeedback and used in future training cycles to refine similarity weights.</p>
                            </div>
                            
                            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
                                <h4 className="font-semibold mb-2">Background Jobs:</h4>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>buildUserVectors:</strong> Nightly rebuild of all user preference vectors</li>
                                    <li><strong>computeSimilarUsers:</strong> Weekly recalculation of user-user similarity graph</li>
                                </ul>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <Button 
                    onClick={handleScanGtinDuplicates}
                    disabled={isMergingGtins || processState.loading}
                    className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                >
                    <GitMerge className="w-4 h-4 mr-2" />
                    {isMergingGtins ? 'Scanning...' : 'Scan GTIN Duplicates'}
                </Button>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <HelpCircle className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <GitMerge className="w-5 h-5 text-teal-600" />
                                Merge GTIN Duplicates
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <p className="text-gray-700 dark:text-gray-300">
                                Finds products with the same name but different GTINs and unifies them.
                            </p>
                            <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-teal-900 dark:text-teal-200">Selection Logic:</h4>
                                <ol className="list-decimal list-inside text-xs text-gray-700 dark:text-gray-300 space-y-1">
                                    <li>Choose the most common GTIN</li>
                                    <li>If tie: Choose the GTIN with more digits</li>
                                    <li>If same length: Choose the higher number (e.g., 800 vs 100)</li>
                                </ol>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <div className="flex gap-1">
                    <Button 
                        onClick={handleRebuildUserHabits}
                        disabled={processState.loading}
                        className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                    >
                        <Database className="w-4 h-4 mr-2" />
                        {processState.loading && processState.activeProcess === 'rebuildUserHabits' ? 'Processing...' : 'Rebuild User Habits'}
                    </Button>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button 
                                size="icon" 
                                variant="outline"
                                className="shrink-0"
                                disabled={processState.loading}
                            >
                                <Settings className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 space-y-3">
                            <div>
                                <Label htmlFor="batchDelay" className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Delay between batches (ms)
                                </Label>
                                <Input
                                    id="batchDelay"
                                    type="number"
                                    min="0"
                                    step="500"
                                    value={batchDelay}
                                    onChange={(e) => setBatchDelay(Number(e.target.value))}
                                    className="w-full mt-1"
                                    disabled={processState.loading}
                                />
                            </div>
                            <div>
                                <Label htmlFor="maxHabitsPerBatch" className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Habits per batch
                                </Label>
                                <Input
                                    id="maxHabitsPerBatch"
                                    type="number"
                                    min="10"
                                    max="200"
                                    step="10"
                                    value={maxHabitsPerBatch}
                                    onChange={(e) => setMaxHabitsPerBatch(Number(e.target.value))}
                                    className="w-full mt-1"
                                    disabled={processState.loading}
                                />
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button 
                            size="icon" 
                            variant="ghost" 
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                            <HelpCircle className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-orange-600" />
                                Rebuild User Habits - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">Process Overview:</h4>
                                <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Iterates through all users in batches.</li>
                                    <li>For each user, fetches all their receipts, sorted by purchase date.</li>
                                    <li>Deletes any existing UserProductHabit records for that user to ensure a clean slate.</li>
                                    <li>Re-calculates product purchase habits based on the user's entire receipt history. This includes tracking purchase count, last purchase date, average cadence (days between purchases), and average quantity.</li>
                                    <li>Habits are processed chronologically to correctly derive cadence.</li>
                                    <li>Bulk creates the newly calculated UserProductHabit records for the user.</li>
                                </ul>
                            </div>

                            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-orange-900 dark:text-orange-200">Habit Calculation Logic:</h4>
                                <ul className="list-disc list-inside ml-2 text-gray-700 dark:text-gray-300 space-y-1">
                                    <li><strong>Product Identification:</strong> Uses SKU, code, or product name from receipt items.</li>
                                    <li><strong>Cadence Calculation:</strong> For subsequent purchases of the same product, it calculates the days since the last purchase and updates the average cadence incrementally.</li>
                                    <li><strong>Average Quantity:</strong> Calculates the average quantity purchased per item.</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Batch Processing:</h4>
                                <p className="text-gray-700 dark:text-gray-300 mb-2">The function processes users in small batches (default 1 user per batch) to prevent timeouts, especially for apps with many users or extensive receipt histories.</p>
                                <p className="text-gray-700 dark:text-gray-300">This allows the processManager to update progress and manage the overall operation.</p>
                            </div>

                            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
                                <h4 className="font-semibold mb-2">Idempotency:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">The process ensures idempotency by clearing existing habits for a user before recalculating, meaning running it multiple times for the same user yields the same result.</p>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>

        {/* GTIN Duplicates - Approval UI */}
        {gtinDuplicates && gtinDuplicates.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                            <GitMerge className="w-4 h-4" />
                            Found {gtinDuplicates.length} Duplicate Groups
                        </h3>
                        <div className="flex gap-2">
                            <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => setGtinDuplicates(null)}
                            >
                                Cancel All
                            </Button>
                            <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={handleApproveAll}
                                disabled={processingMerge}
                            >
                                Approve All
                            </Button>
                        </div>
                    </div>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                        {gtinDuplicates.map((dup, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{dup.displayName}</p>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="sm" 
                                            variant="outline"
                                            onClick={() => handleSkipMerge(dup)}
                                            disabled={processingMerge === dup.name}
                                        >
                                            Skip
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            className="bg-green-600 hover:bg-green-700"
                                            onClick={() => handleApproveMerge(dup)}
                                            disabled={processingMerge === dup.name}
                                        >
                                            {processingMerge === dup.name ? 'Merging...' : 'Approve'}
                                        </Button>
                                    </div>
                                </div>
                                
                                {/* Products table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-gray-900">
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">GTIN</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Chain ID</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Item Code</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Category</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Brand</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Kosher</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Allergens</th>
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left">Price</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dup.products.map((product, pIdx) => {
                                                const isReference = product.gtin === dup.bestGtin;
                                                const categories = [...new Set(dup.products.map(p => p.category || ''))];
                                                const brands = [...new Set(dup.products.map(p => p.brand_name || ''))];
                                                const koshers = [...new Set(dup.products.map(p => p.kosher_level || ''))];
                                                const allergenSets = dup.products.map(p => JSON.stringify(p.allergen_tags || []));
                                                const uniqueAllergens = [...new Set(allergenSets)];
                                                
                                                return (
                                                    <tr key={pIdx} className={isReference ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 font-mono ${isReference ? 'font-bold text-green-700 dark:text-green-400' : ''}`}>
                                                            {product.gtin} {isReference && '✓'}
                                                        </td>
                                                        <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 font-mono text-gray-600 dark:text-gray-400">
                                                            {product.chain_id || '-'}
                                                        </td>
                                                        <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 font-mono text-gray-600 dark:text-gray-400">
                                                            {product.chain_item_code || '-'}
                                                        </td>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 ${categories.length > 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : ''}`}>
                                                            {product.category || '-'}
                                                        </td>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 ${brands.length > 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : ''}`}>
                                                            {product.brand_name || '-'}
                                                        </td>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 ${koshers.length > 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : ''}`}>
                                                            {product.kosher_level || '-'}
                                                        </td>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 ${uniqueAllergens.length > 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : ''}`}>
                                                            {product.allergen_tags?.join(', ') || '-'}
                                                        </td>
                                                        <td className="border border-gray-200 dark:border-gray-700 px-2 py-1">
                                                            {product.current_price ? `₪${product.current_price}` : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="mt-2 text-xs text-gray-500">
                                    Will merge {dup.productsToUpdate.length} products to GTIN: <span className="font-mono font-bold text-green-600">{dup.bestGtin}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )}

        {/* GTIN Merge Results */}
        {gtinMergeResults && (
            <Card className="border-teal-200 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-800">
                <CardContent className="p-4">
                    <h3 className="font-bold text-teal-900 dark:text-teal-200 mb-2 flex items-center gap-2">
                        <GitMerge className="w-4 h-4" />
                        GTIN Merge Results
                    </h3>
                    <p className="text-sm text-teal-700 dark:text-teal-300 mb-3">{gtinMergeResults.message}</p>
                    {gtinMergeResults.details && gtinMergeResults.details.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left p-1 font-semibold">Product Name</th>
                                        <th className="text-left p-1 font-semibold">Old GTINs</th>
                                        <th className="text-left p-1 font-semibold">New GTIN</th>
                                        <th className="text-right p-1 font-semibold">Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {gtinMergeResults.details.map((detail, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                                            <td className="p-1 truncate max-w-[150px]" title={detail.name}>{detail.name}</td>
                                            <td className="p-1 text-red-600 dark:text-red-400">{detail.oldGtins.join(', ')}</td>
                                            <td className="p-1 text-green-600 dark:text-green-400 font-mono">{detail.newGtin}</td>
                                            <td className="p-1 text-right">{detail.updatedCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-3"
                        onClick={() => setGtinMergeResults(null)}
                    >
                        Dismiss
                    </Button>
                </CardContent>
            </Card>
        )}

        <SystemValidationPanel />

        {/* Global Process Results Display */}
        {processState.results && processState.results.length > 0 && !processState.loading && (
            <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-gray-100">
                        Process Results: {processState.status}
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
                        {processState.results.map((item, idx) => (
                            <div key={idx} className="text-xs border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
                                <pre className="whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )}

        {showConfirm &&
      <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-red-900 dark:text-red-300">⚠️ Confirm Deletion</h3>
                    <p className="text-sm text-red-700 dark:text-red-400">
                        Are you sure you want to delete all {receipts.length} receipts? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                        <Button
              variant="outline"
              className="flex-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}>

                            Cancel
                        </Button>
                        <Button
              className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              onClick={handleDeleteAllReceipts}
              disabled={isDeleting}>

                            {isDeleting ? 'Deleting...' : 'Delete All'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
      }

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200">User Database</h3>
            </div>
            <Table>
                <TableHeader>
                    <TableRow className="dark:border-gray-700">
                        <TableHead className="text-muted-foreground px-1 font-medium text-left h-10 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-gray-400">Display Name</TableHead>
                        <TableHead className="text-muted-foreground font-medium text-left h-10 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-gray-400">Role</TableHead>
                        <TableHead className="text-muted-foreground px-1 font-medium text-left h-10 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-gray-400">Receipts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) =>
            <TableRow key={user.id} className="dark:border-gray-700">
                            <TableCell className="text-gray-900 px-1 py-2 font-medium align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-gray-200">
                                  <div className="flex flex-col">
                                      <span>{user.display_name || user.full_name || user.email}</span>
                                      <span className="text-xs text-gray-500 font-normal">{user.email}</span>
                                  </div>
                              </TableCell>
                            <TableCell className="align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                    {user.role}
                                </span>
                            </TableCell>
                            <TableCell className="text-gray-900 px-6 py-3 text-right align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-gray-300">{user.receipts}</TableCell>
                        </TableRow>
            )}
                </TableBody>
            </Table>
        </div>
    </div>);

}