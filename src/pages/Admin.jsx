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
  const [selectedProducts, setSelectedProducts] = useState({}); // { dupName: { productId: boolean } }
  const [selectedTargetGtin, setSelectedTargetGtin] = useState({}); // { dupName: gtin }


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
        await processManager.startProcess('buildUserVectors', { limit: 10, mode: 'full' }, { delayMs: batchDelay });
    } catch (err) {
        console.error('Vector rebuild failed:', err);
    }
  };

  const handleRebuildUserHabits = async () => {
    try {
        // Use 60 second delay between users to avoid rate limits
        await processManager.startProcess('rebuildUserHabits', { limit: 1, maxHabitsPerBatch, mode: 'full' }, { delayMs: 60000 });
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

          // Skip if all products are from the same chain_id
          const uniqueChainIds = [...new Set(products.map(p => p.chain_id).filter(Boolean))];
          if (uniqueChainIds.length <= 1) {
            continue; // All from same chain, skip this group
          }

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
        // Initialize selections
        const initialSelected = {};
        const initialTargetGtin = {};
        duplicates.forEach(dup => {
          initialSelected[dup.name] = {};
          dup.products.forEach(p => {
            // Pre-select products that are not the reference
            initialSelected[dup.name][p.id] = p.gtin !== dup.bestGtin;
          });
          initialTargetGtin[dup.name] = dup.bestGtin;
        });
        setSelectedProducts(initialSelected);
        setSelectedTargetGtin(initialTargetGtin);
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
      const targetGtin = selectedTargetGtin[duplicate.name] || duplicate.bestGtin;
      const selected = selectedProducts[duplicate.name] || {};
      const productsToMerge = duplicate.products.filter(p => selected[p.id] && p.gtin !== targetGtin);
      
      for (const product of productsToMerge) {
        await base44.entities.Product.update(product.id, { gtin: targetGtin });
      }
      
      // Remove from pending list
      setGtinDuplicates(prev => prev.filter(d => d.name !== duplicate.name));
      
      // Update results
      setGtinMergeResults(prev => ({
        message: `Merged ${(prev?.updated || 0) + productsToMerge.length} products`,
        updated: (prev?.updated || 0) + productsToMerge.length,
        details: [...(prev?.details || []), {
          name: duplicate.displayName,
          oldGtins: duplicate.gtins.filter(g => g !== targetGtin),
          newGtin: targetGtin,
          updatedCount: productsToMerge.length
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
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
                                    <li>Upload compressed XML catalog file (.gz format)</li>
                                    <li>Decompress using fflate and parse XML with fast-xml-parser</li>
                                    <li>Extract ChainId, StoreId, SubChainId from XML root</li>
                                    <li>Create/update Chain record (with web search for new chains)</li>
                                    <li>Create/update Store record linked to chain</li>
                                    <li>Bulk create new products or update existing (batches of 1000)</li>
                                    <li>Mark new/uncategorized products with enrichment_status='pending'</li>
                                </ol>
                            </div>

                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-emerald-900 dark:text-emerald-200">Chain Information (New Chains Only):</h4>
                                <p className="mb-2 text-gray-700 dark:text-gray-300">LLM with internet search finds:</p>
                                <ul className="list-disc list-inside ml-2 text-gray-700 dark:text-gray-300">
                                    <li>Website URL & Logo URL</li>
                                    <li>Brief description</li>
                                    <li>Chain type (supermarket, discount_store, premium_store, organic_store, kosher_store, convenience_store)</li>
                                </ul>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">Store Location Discovery:</h4>
                                <p className="text-gray-700 dark:text-gray-300">For new chains or chains without stores, queries OpenStreetMap Nominatim API:</p>
                                <div className="bg-white dark:bg-gray-800 p-2 rounded text-xs font-mono mt-2">
                                    <code>nominatim.openstreetmap.org/search?q=[ChainName] Israel&limit=50</code>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 mt-2">Creates Store records with address, city, lat/lon coordinates.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Product Data Extracted:</h4>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300 text-xs">
                                    <li>ItemCode → gtin, chain_item_code</li>
                                    <li>ItemName → canonical_name, display_name</li>
                                    <li>ManufacturerName → brand_name</li>
                                    <li>ItemPrice → current_price</li>
                                    <li>UnitOfMeasurePrice → unit_price</li>
                                    <li>bIsWeighted → is_weight_based</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Background Enrichment:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Products marked 'pending' are enriched by a separate background job (enrichProductsJob) which adds category, kosher_level, and allergen_tags via LLM.</p>
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
                                <h4 className="font-semibold mb-2">Process Overview:</h4>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Fetches stores in batches (default: 5 per batch)</li>
                                    <li>For each store, fetches all StoreReview records</li>
                                    <li>Filters reviews with comments for LLM analysis</li>
                                    <li>Creates/updates StoreSentiment record per store</li>
                                    <li>On final batch, aggregates to ChainSentiment</li>
                                </ol>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">LLM Sentiment Analysis:</h4>
                                <p className="mb-2 text-gray-700 dark:text-gray-300">Each review comment is analyzed individually:</p>
                                <details className="mt-2">
                                    <summary className="cursor-pointer text-xs font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100">
                                        Show actual LLM prompt & schema
                                    </summary>
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded text-xs font-mono mt-2 space-y-3">
                                        <div>
                                            <p className="text-gray-500 dark:text-gray-400 mb-1">Prompt:</p>
                                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">"Analyze review for grocery store. Return JSON. Review: "[review.comment]""</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 dark:text-gray-400 mb-1">Response JSON Schema:</p>
                                            <pre className="text-gray-700 dark:text-gray-300 overflow-x-auto">{`{
                                          "type": "object",
                                          "properties": {
                                            "sentiment": { 
                                              "type": "number", 
                                              "enum": [1, -1] 
                                            },
                                            "explanation": { 
                                              "type": "string" 
                                            },
                                            "themes": { 
                                              "type": "array", 
                                              "items": { "type": "string" } 
                                            }
                                          },
                                          "required": ["sentiment", "explanation", "themes"]
                                        }`}</pre>
                                        </div>
                                    </div>
                                </details>
                                <p className="text-gray-700 dark:text-gray-300 mt-2 text-xs">Returns: sentiment (1 or -1), explanation, themes array</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">StoreSentiment Record:</h4>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300 text-xs">
                                    <li><strong>overall_sentiment:</strong> 'positive' | 'negative' | 'neutral' (majority vote)</li>
                                    <li><strong>sentiment_score:</strong> likes count &gt; dislikes = 1, else -1 or 0</li>
                                    <li><strong>average_rating:</strong> Mean of star ratings (1-5)</li>
                                    <li><strong>positive_reviews / negative_reviews:</strong> Counts</li>
                                    <li><strong>common_themes:</strong> Top 5 themes mentioned</li>
                                    <li><strong>sentiment_explanations:</strong> Array of LLM explanations</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">ChainSentiment Aggregation:</h4>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300 text-xs">
                                    <li><strong>average_rating:</strong> Mean across all stores in chain</li>
                                    <li><strong>overall_sentiment:</strong> Majority based on store sentiment counts</li>
                                    <li><strong>positive/neutral/negative_stores:</strong> Store breakdown</li>
                                    <li><strong>total_stores_analyzed:</strong> Count of stores with sentiment</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Rate Limiting:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">1000ms delay between stores, 500ms between reviews. Stops after 1 consecutive LLM error to prevent runaway failures.</p>
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
                                Rebuild User Vectors - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">Process Overview:</h4>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Process users in batches (default: 10 per batch)</li>
                                    <li>Build Profile Vector from UserProfile data</li>
                                    <li>Build Behavior Vector from receipts, habits, carts, feedback</li>
                                    <li>Save vectors to UserVectorSnapshot entity</li>
                                    <li>Compute similar users via cosine similarity</li>
                                    <li>Store top 10 neighbors in SimilarUserEdge</li>
                                </ol>
                            </div>
                            
                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">Profile Vector Components:</h4>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300 text-xs">
                                    <li><strong>kosher_[level]:</strong> From kashrut_level (1.0 if set)</li>
                                    <li><strong>diet_[type]:</strong> From diet preference (1.0 if set)</li>
                                    <li><strong>household_size:</strong> Normalized 0-1 (size/10)</li>
                                    <li><strong>budget_score:</strong> 0=save_money, 0.5=balanced, 0.8=health_focused, 1=high</li>
                                    <li><strong>allergy_[name]:</strong> From allergies array</li>
                                    <li><strong>prefChain_[id]:</strong> Preferred store chains</li>
                                    <li><strong>age_[range], role_[type]:</strong> Demographics</li>
                                </ul>
                            </div>
                            
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">Behavior Vector Data Sources:</h4>
                                <ul className="list-disc list-inside ml-4 text-gray-700 dark:text-gray-300 text-xs">
                                    <li><strong>Receipts (100):</strong> store, category, product, brand signals with time decay (e^(-days/30))</li>
                                    <li><strong>UserProductHabit (200):</strong> Strong product/brand signals weighted by purchase_count × confidence</li>
                                    <li><strong>SavedCart (50):</strong> Intent signals for store, products, brands</li>
                                    <li><strong>UserProductPreference:</strong> Explicit like (+1.5) / dislike (-1.0)</li>
                                    <li><strong>SmartTipFeedback:</strong> Tip type preferences (like +0.5, dislike -0.3)</li>
                                    <li><strong>RecommendationFeedback (100):</strong> Engagement signals (thumbs_up +1.0, add_to_cart +0.8, dismiss -0.3)</li>
                                </ul>
                            </div>
                            
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-green-900 dark:text-green-200">User Similarity Calculation:</h4>
                                <div className="bg-white dark:bg-gray-800 p-2 rounded text-xs font-mono">
                                    <code>cosine_similarity = (A · B) / (||A|| × ||B||)</code>
                                </div>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300 mt-2">
                                    <li>Computed on behavior vectors (normalized)</li>
                                    <li>Minimum threshold: 0.1 similarity</li>
                                    <li>Top 10 similar users stored per user</li>
                                    <li>Old edges deleted before recomputation</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Incremental Mode:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">If mode='incremental', checks for new data since last snapshot (receipts, habits, feedback, profile updates). Skips users with no changes.</p>
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
                                Scan GTIN Duplicates - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div>
                                <h4 className="font-semibold mb-2">Process Overview:</h4>
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300 text-xs">
                                    <li>Fetches all products in batches of 5000</li>
                                    <li>Groups by canonical_name (case-insensitive)</li>
                                    <li>Identifies groups with multiple unique GTINs</li>
                                    <li>Excludes groups where all products are from the same chain</li>
                                    <li>Presents interactive approval UI for merging</li>
                                </ol>
                            </div>

                            <div className="bg-teal-50 dark:bg-teal-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-teal-900 dark:text-teal-200">Target GTIN Selection:</h4>
                                <ol className="list-decimal list-inside text-xs text-gray-700 dark:text-gray-300 space-y-1">
                                    <li>Most common GTIN (highest occurrence count)</li>
                                    <li>If tie: Longer GTIN (more digits)</li>
                                    <li>If same length: Numerically higher value</li>
                                </ol>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Exclusion Rules:</h4>
                                <ul className="list-disc list-inside text-xs text-gray-700 dark:text-gray-300">
                                    <li>Products with same chain_id AND chain_item_code as reference</li>
                                    <li>Groups where all products belong to a single chain</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Approval UI Features:</h4>
                                <ul className="list-disc list-inside text-xs text-gray-700 dark:text-gray-300">
                                    <li>Select/deselect individual products to merge</li>
                                    <li>Change target GTIN via dropdown</li>
                                    <li>Highlights data conflicts (category, brand, kosher, allergens)</li>
                                    <li>Approve individual groups or all at once</li>
                                </ul>
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
                                <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                                    <li>Process users in batches (default: 1 user per batch)</li>
                                    <li>Fetch receipts by user_email + created_by (merged, deduplicated)</li>
                                    <li>Sort receipts by purchased_at ascending (chronological)</li>
                                    <li>FULL mode: Delete existing habits, rebuild from scratch</li>
                                    <li>INCREMENTAL mode: Only process receipts newer than last habit</li>
                                    <li>Bulk create UserProductHabit records</li>
                                </ol>
                            </div>

                            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-orange-900 dark:text-orange-200">UserProductHabit Fields:</h4>
                                <ul className="list-disc list-inside ml-2 text-gray-700 dark:text-gray-300 text-xs space-y-1">
                                    <li><strong>product_id:</strong> SKU || code || name from receipt item</li>
                                    <li><strong>product_name:</strong> Latest item name</li>
                                    <li><strong>purchase_count:</strong> Total times purchased</li>
                                    <li><strong>last_purchase_date:</strong> Most recent purchase</li>
                                    <li><strong>avg_cadence_days:</strong> Average days between purchases</li>
                                    <li><strong>avg_quantity:</strong> Average quantity per purchase</li>
                                    <li><strong>confidence_score:</strong> From receipt item (default 0.5)</li>
                                </ul>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">Cadence Calculation:</h4>
                                <div className="bg-white dark:bg-gray-800 p-2 rounded text-xs font-mono">
                                    <code>newCadence = (oldCadence × (N-2) + daysSince) / (N-1)</code>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mt-2">Only updates if daysSince &gt; 0.1 (separate trips, not same receipt)</p>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Rate Limiting & Chunking:</h4>
                                <ul className="list-disc list-inside text-xs text-gray-700 dark:text-gray-300">
                                    <li>Deletes habits in batches of 50</li>
                                    <li>Creates habits in batches (maxHabitsPerBatch, default 50)</li>
                                    <li>60 second delay between users (configurable)</li>
                                    <li>Returns hasMore=true if more chunks needed</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Incremental Mode:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Only processes receipts newer than the latest last_purchase_date in existing habits. Updates existing habits in-place and creates new ones for new products.</p>
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
                        {gtinDuplicates.map((dup, idx) => {
                            const targetGtin = selectedTargetGtin[dup.name] || dup.bestGtin;
                            const selected = selectedProducts[dup.name] || {};
                            const selectedCount = Object.entries(selected).filter(([id, checked]) => {
                                const product = dup.products.find(p => p.id === id);
                                return checked && product?.gtin !== targetGtin;
                            }).length;
                            
                            return (
                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{dup.displayName}</p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-500">Target GTIN:</span>
                                            <select 
                                                className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 font-mono"
                                                value={targetGtin}
                                                onChange={(e) => setSelectedTargetGtin(prev => ({...prev, [dup.name]: e.target.value}))}
                                            >
                                                {dup.gtins.map(gtin => (
                                                    <option key={gtin} value={gtin}>{gtin}</option>
                                                ))}
                                            </select>
                                        </div>
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
                                            disabled={processingMerge === dup.name || selectedCount === 0}
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
                                                <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-center w-8">
                                                    <input 
                                                        type="checkbox"
                                                        checked={dup.products.filter(p => p.gtin !== targetGtin).every(p => selected[p.id])}
                                                        onChange={(e) => {
                                                            const newSelected = {...selected};
                                                            dup.products.forEach(p => {
                                                                if (p.gtin !== targetGtin) {
                                                                    newSelected[p.id] = e.target.checked;
                                                                }
                                                            });
                                                            setSelectedProducts(prev => ({...prev, [dup.name]: newSelected}));
                                                        }}
                                                        className="w-3 h-3"
                                                    />
                                                </th>
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
                                                const isTarget = product.gtin === targetGtin;
                                                const isChecked = selected[product.id] || false;
                                                const categories = [...new Set(dup.products.map(p => p.category || ''))];
                                                const brands = [...new Set(dup.products.map(p => p.brand_name || ''))];
                                                const koshers = [...new Set(dup.products.map(p => p.kosher_level || ''))];
                                                const allergenSets = dup.products.map(p => JSON.stringify(p.allergen_tags || []));
                                                const uniqueAllergens = [...new Set(allergenSets)];
                                                
                                                return (
                                                    <tr key={pIdx} className={isTarget ? 'bg-green-50 dark:bg-green-900/20' : isChecked ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                                                        <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-center">
                                                            {isTarget ? (
                                                                <span className="text-green-600 font-bold">✓</span>
                                                            ) : (
                                                                <input 
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        setSelectedProducts(prev => ({
                                                                            ...prev,
                                                                            [dup.name]: {...prev[dup.name], [product.id]: e.target.checked}
                                                                        }));
                                                                    }}
                                                                    className="w-3 h-3"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className={`border border-gray-200 dark:border-gray-700 px-2 py-1 font-mono ${isTarget ? 'font-bold text-green-700 dark:text-green-400' : ''}`}>
                                                            {product.gtin} {isTarget && '(target)'}
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
                                    Will merge {selectedCount} selected products to GTIN: <span className="font-mono font-bold text-green-600">{targetGtin}</span>
                                </div>
                            </div>
                        )})}
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