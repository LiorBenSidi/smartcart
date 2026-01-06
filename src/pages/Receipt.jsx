import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, Coins, ArrowLeft, Tag, Download, Loader2, RefreshCw, XCircle, Plus, Trash2, Calendar, Clock, MapPin, CheckCircle2, PackagePlus, Sparkles, TrendingDown, ArrowDownRight, ArrowRightLeft, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PriceComparisonReview from '../components/PriceComparisonReview';
import AddProductDialog from '../components/AddProductDialog';
import ReceiptReview from '../components/ReceiptReview';

export default function Receipt() {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPriceComparison, setShowPriceComparison] = useState(false);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [productMap, setProductMap] = useState(new Map());
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(null);
  const [itemBenchmarks, setItemBenchmarks] = useState([]);
  const [expandedInsight, setExpandedInsight] = useState(null);

  // Process pending receipt
  const processReceipt = async (r) => {
    if (!r || r.processing_status !== 'pending' || isProcessing) return;
    setIsProcessing(true);

    try {
        // Call backend function for robust extraction
        const response = await base44.functions.invoke('processReceipt', { receiptId: r.id });
        
        if (response.data.success) {
            const updatedReceipt = { ...r, ...response.data.data };
            setReceipt(updatedReceipt);
            
            // If needs review, we stay on this page and the render logic handles it
            if (response.data.needs_review) {
                // Just update state, the component will render ReviewReceipt
            } else {
                // If by miracle it's perfect, we can proceed (e.g. to comparison or summary)
                // But generally we expect review.
            }
        } else {
            throw new Error(response.data.error || "Unknown processing error");
        }

    } catch (error) {
      console.error("Processing failed", error);
      await base44.entities.Receipt.update(r.id, { processing_status: 'failed', processing_error_message: error.message });
      setReceipt({ ...r, processing_status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReviewConfirm = async (confirmedReceipt) => {
      setReceipt(confirmedReceipt);
      
      // Trigger economic analysis
      try {
          const analysisRes = await base44.functions.invoke('analyzeReceiptEconomics', { receiptId: confirmedReceipt.id });
          if (analysisRes.data.success) {
               // Reload receipt to get new insights
               const refreshed = await base44.entities.Receipt.filter({ id: confirmedReceipt.id });
               if (refreshed.length > 0) {
                   setReceipt(refreshed[0]);
               }
          }
      } catch (e) {
          console.error("Analysis failed", e);
      }
  };

  const handleItemChange = (index, field, value) => {
    if (!editData) return;
    const newItems = [...editData.items];
    let newItem = { ...newItems[index] };

    if (field === 'quantity' || field === 'price') {
      const numValue = parseFloat(value) || 0;
      newItem[field] = numValue;
      // If price changes, update total to match (since price is line total)
      if (field === 'price') {
        newItem.total = numValue;
      }
    } else if (field === 'total') {
      newItem.total = parseFloat(value) || 0;
    } else {
      newItem[field] = value;
    }
    
    newItems[index] = newItem;
    setEditData({ ...editData, items: newItems });
  };

  const handleDeleteItem = (index) => {
    if (!editData) return;
    const newItems = editData.items.filter((_, i) => i !== index);
    setEditData({ ...editData, items: newItems });
  };

  const handleAddItem = () => {
    if (!editData) return;
    const newItem = { code: "", name: "New Item", category: "Other", quantity: 1, price: 0, total: 0 };
    setEditData({ ...editData, items: [...editData.items, newItem] });
  };

  const calculateSum = () => {
    if (!editData || !editData.items) return 0;
    return editData.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const saveReceipt = async () => {
    if (!editData) return;
    setIsSaving(true);
    
    try {
      const currentCalculatedSum = calculateSum();

      const payload = {
        ...editData,
        total_amount: currentCalculatedSum,
        totalAmount: currentCalculatedSum,
        processing_status: 'processed'
      };

      await base44.entities.Receipt.update(receipt.id, payload);
      setReceipt(payload);
      setEditMode(false);
    } catch (error) {
      console.error("Failed to save", error);
    } finally {
      setIsSaving(false);
    }
  };

  const PRESET_STORES = ["שופרסל", "רמי לוי", "אושר עד", "יינות ביתן", "טיב טעם", "am:pm"];

  const handleExportCSV = () => {
    if (!receipt) return;

    const headers = ['Date', 'Store', 'Address', 'Total Amount', 'Item Name', 'Category', 'Quantity', 'Price', 'Item Total'];
    const rows = [];

    if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach(item => {
            rows.push([
                receipt.date,
                `"${receipt.storeName || ''}"`,
                `"${receipt.address || ''}"`,
                receipt.totalAmount || receipt.total_amount || 0,
                `"${item.name}"`,
                item.category,
                item.quantity,
                item.price,
                item.total
            ].join(','));
        });
    } else {
         rows.push([
                receipt.date,
                `"${receipt.storeName || ''}"`,
                `"${receipt.address || ''}"`,
                receipt.totalAmount || receipt.total_amount || 0,
                '',
                '',
                '',
                '',
                ''
            ].join(','));
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `receipt_${receipt.storeName || 'store'}_${receipt.date || 'date'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    const fetchReceipt = async () => {
      if (id) {
        try {
            const user = await base44.auth.me();
            let adminStatus = user.role === 'admin';
            if (!adminStatus) {
                try {
                    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
                    if (profiles.length > 0 && profiles[0].is_admin) {
                        adminStatus = true;
                    }
                } catch(e) {
                    console.error("Error checking admin status", e);
                }
            }
            setIsAdmin(adminStatus);

            let data;
            if (adminStatus) {
                data = await base44.entities.Receipt.filter({ id });
            } else {
                data = await base44.entities.Receipt.filter({ id, created_by: user.email });
            }

            if (data.length > 0) {
              setReceipt(data[0]);
              
              // Fetch benchmarks for this receipt
              try {
                  const benchmarks = await base44.entities.ReceiptItemBenchmark.filter({ receipt_id: id });
                  setItemBenchmarks(benchmarks);
              } catch (bmError) {
                  console.error("Failed to load benchmarks", bmError);
              }

              // If pending, trigger processing
              if (data[0].processing_status === 'pending') {
                processReceipt(data[0]);
              }
            }
        } catch (e) {
            console.error("Error loading receipt", e);
        }
      }
      setLoading(false);
    };
    
    fetchReceipt();
  }, []);

  const retryProcessing = async () => {
    if (!receipt) return;

    const updatedReceipt = { ...receipt, processing_status: 'pending' };
    setReceipt(updatedReceipt);
    await base44.entities.Receipt.update(receipt.id, { processing_status: 'pending' });
    processReceipt(updatedReceipt);
  };

  const handlePriceComparisonConfirm = async (updates, selections, differencesOnly) => {
    setIsUpdatingPrices(true);
    try {
      if (updates.length > 0) {
        await base44.functions.invoke('updatePrices', { updates });
      }
      
      // Update editData items with selected prices
      const updatedItems = editData.items.map(item => {
        const diffIndex = differencesOnly.findIndex(d => d.item.code === item.code);
        if (diffIndex !== -1 && selections[diffIndex]) {
          const diff = differencesOnly[diffIndex];
          const selectedPrice = selections[diffIndex] === 'receipt' ? diff.receiptPrice : diff.dbPrice;
          return { ...item, price: selectedPrice, total: selectedPrice * item.quantity };
        }
        return item;
      });

      setEditData({ ...editData, items: updatedItems });
      
      // Proceed to edit mode
      setShowPriceComparison(false);
      await loadProductsForEditMode();
      setEditMode(true);
    } catch (error) {
      console.error("Failed to update prices", error);
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  const handlePriceComparisonCancel = async () => {
    // Skip price updates, go to edit mode
    setShowPriceComparison(false);
    await loadProductsForEditMode();
    setEditMode(true);
  };

  const loadProductsForEditMode = async () => {
    try {
      const products = await base44.entities.Product.list();
      const map = new Map(products.map(p => [p.gtin, p]));
      setProductMap(map);
    } catch (error) {
      console.error("Failed to load products", error);
    }
  };

  const handleProductAdded = async (product) => {
    // Reload products after adding new one
    await loadProductsForEditMode();
  };

  const calculatedSum = calculateSum();
  const hasMismatch = editData ? Math.abs(calculatedSum - (editData.totalAmount || 0)) > 0.05 : false;

  if (loading) return <div className="p-10 text-center text-gray-500">Loading receipt...</div>;
  if (!receipt) return <div className="p-10 text-center text-gray-500">Receipt not found.</div>;

  // Show Review Mode if needed
  if (receipt.needs_review) {
      return (
          <div className="min-h-screen max-w-6xl mx-auto pb-20 pt-6 px-4">
              <div className="flex items-center gap-2 mb-6">
                <Link to={createPageUrl('Home')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                </Link>
                <h2 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Review Receipt</h2>
              </div>
              <ReceiptReview receipt={receipt} onConfirm={handleReviewConfirm} />
          </div>
      );
  }

  // Show price comparison review
  if (showPriceComparison && comparisonResults) {
    return (
      <PriceComparisonReview
        comparisonResults={comparisonResults}
        onConfirm={handlePriceComparisonConfirm}
        onCancel={handlePriceComparisonCancel}
        isUpdating={isUpdatingPrices}
      />
    );
  }

  // Show edit mode after processing
  if (editMode && editData) {
    return (
      <div className="min-h-screen space-y-6 pb-20 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link to={createPageUrl('Home')}>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </Button>
          </Link>
          <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Review Receipt</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-12rem)]">
          {/* Receipt Image */}
          {receipt.raw_receipt_image_url && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden h-fit sticky top-4">
              <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scanned Receipt</h3>
              </div>
              <div className="p-4">
                <img 
                  src={receipt.raw_receipt_image_url} 
                  alt="Receipt" 
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
          )}

          {/* Edit Form */}
          <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="bg-indigo-600 dark:bg-indigo-900 px-6 py-6 text-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-indigo-200 text-xs block mb-1">Store</label>
                <Input 
                  list="store-options"
                  value={editData.storeName}
                  onChange={(e) => setEditData({...editData, storeName: e.target.value})}
                  className="bg-white/10 border-indigo-400/30 text-white placeholder:text-indigo-300 focus:bg-white/20"
                />
                <datalist id="store-options">
                  {PRESET_STORES.map(store => <option key={store} value={store} />)}
                </datalist>
              </div>
              <div>
                <label className="text-indigo-200 text-xs block mb-1">Total Amount</label>
                <Input 
                  type="number"
                  value={editData.totalAmount}
                  onChange={(e) => setEditData({...editData, totalAmount: parseFloat(e.target.value) || 0})}
                  className="bg-white/10 border-indigo-400/30 text-white font-bold text-lg focus:bg-white/20"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-indigo-200 text-xs block mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Date</label>
                <Input 
                  type="date"
                  value={editData.date}
                  onChange={(e) => setEditData({...editData, date: e.target.value})}
                  className="bg-white/10 border-indigo-400/30 text-white text-xs h-8 focus:bg-white/20"
                />
              </div>
              <div>
                <label className="text-indigo-200 text-xs block mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/> Time</label>
                <Input 
                  type="time"
                  value={editData.time || ''}
                  onChange={(e) => setEditData({...editData, time: e.target.value})}
                  className="bg-white/10 border-indigo-400/30 text-white text-xs h-8 focus:bg-white/20"
                />
              </div>
              <div>
                <label className="text-indigo-200 text-xs block mb-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Address</label>
                <Input 
                  value={editData.address || ''}
                  onChange={(e) => setEditData({...editData, address: e.target.value})}
                  className="bg-white/10 border-indigo-400/30 text-white text-xs h-8 focus:bg-white/20"
                  placeholder="Store Address"
                />
              </div>
            </div>
          </div>
          
          <div className="p-4 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left font-medium pb-2 pl-2">Code & Item</th>
                  <th className="text-center font-medium pb-2 w-16">Qty</th>
                  <th className="text-center font-medium pb-2 w-20">Price</th>
                  <th className="text-right font-medium pb-2 w-20">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {editData.items.map((item, i) => {
                  const dbProduct = item.code ? productMap.get(item.code?.toString().trim()) : null;
                  const productNotFound = item.code && !dbProduct;
                  const displayName = dbProduct ? dbProduct.canonical_name : item.name || `product no. ${i + 1}`;
                  
                  return (
                  <tr key={i} className="group">
                    <td className="py-3 pl-2 align-top">
                      <div className="flex items-center gap-2 mb-1">
                        <Input 
                          value={displayName} 
                          onChange={(e) => handleItemChange(i, 'name', e.target.value)}
                          className="h-8 text-sm border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:border-indigo-300 flex-1"
                          placeholder="Item name"
                          disabled={!!dbProduct}
                        />
                        {isAdmin && productNotFound && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setShowAddProduct(item)}
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                            title="Add product to database"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      {productNotFound && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Product not found in database
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Input 
                          value={item.code || ''} 
                          onChange={(e) => handleItemChange(i, 'code', e.target.value)}
                          className="h-6 w-28 text-[10px] text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                          placeholder="Code"
                        />
                        <Input 
                          value={item.category} 
                          onChange={(e) => handleItemChange(i, 'category', e.target.value)}
                          className="h-6 flex-1 text-[10px] text-gray-500 dark:text-gray-400 border-transparent bg-gray-50 dark:bg-gray-900 hover:bg-white dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700 focus:border-indigo-300 transition-all"
                          placeholder="Category"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-1 align-top">
                      <Input 
                        type="number"
                        value={item.quantity} 
                        onChange={(e) => handleItemChange(i, 'quantity', e.target.value)}
                        className="h-8 text-sm text-center px-1 border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:border-indigo-300"
                        placeholder="Qty"
                      />
                    </td>
                    <td className="py-3 px-1 align-top">
                      <Input 
                        type="number"
                        value={item.price} 
                        onChange={(e) => handleItemChange(i, 'price', e.target.value)}
                        className="h-8 text-sm text-right px-1 border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 focus:border-indigo-300"
                        placeholder="Price"
                      />
                    </td>
                    <td className="py-3 px-1 align-top">
                      <div className="h-8 flex items-center justify-end px-1 text-sm font-bold text-gray-700 dark:text-gray-200">
                        ₪{(item.total || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="py-3 pr-1 align-top text-right">
                      <button 
                        onClick={() => handleDeleteItem(i)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAddItem}
                className="w-full text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 dark:hover:bg-gray-800"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Missing Item
              </Button>
            </div>
          </div>
        </div>

        {hasMismatch && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-800 dark:text-amber-200 text-sm">Total Mismatch Detected</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Sum of items (₪{calculatedSum.toFixed(2)}) does not match the receipt total (₪{(editData.totalAmount || 0).toFixed(2)}).
                Please review your items or update the total amount.
              </p>
            </div>
          </div>
        )}

        <Button 
          onClick={saveReceipt} 
          disabled={isSaving}
          className={`w-full h-12 shadow-md text-white transition-all ${
            hasMismatch 
              ? "bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-200 ring-offset-2" 
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {isSaving ? (
            <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Saving...</>
          ) : hasMismatch ? (
            <><AlertTriangle className="mr-2 w-5 h-5" /> Confirm Mismatch & Save</>
          ) : (
            <><CheckCircle2 className="mr-2 w-5 h-5" /> Save & Continue</>
          )}
        </Button>

        {showAddProduct && (
          <AddProductDialog
            item={showAddProduct}
            onClose={() => setShowAddProduct(null)}
            onSuccess={handleProductAdded}
          />
        )}
          </div>
        </div>
        </div>
        );
        }

  // Show pending state
  if (receipt.processing_status === 'pending') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link to={createPageUrl('Home')}>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Button>
          </Link>
          <h2 className="font-bold text-lg text-gray-900">Processing Receipt</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-10 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <h3 className="font-bold text-xl text-gray-900 mb-2">Analyzing Your Receipt</h3>
          <p className="text-gray-500 text-sm mb-6">
            Our AI is extracting items and calculating totals. This usually takes 10-30 seconds.
          </p>
          {receipt.raw_receipt_image_url && (
            <img src={receipt.raw_receipt_image_url} alt="Receipt" className="max-h-64 mx-auto rounded-lg opacity-50" />
          )}
        </div>
      </div>
    );
  }

  // Show failed state
  if (receipt.processing_status === 'failed') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link to={createPageUrl('Home')}>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Button>
          </Link>
          <h2 className="font-bold text-lg text-gray-900">Processing Failed</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-10 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="font-bold text-xl text-gray-900 mb-2">Unable to Process Receipt</h3>
          <p className="text-gray-500 text-sm mb-6">
            We couldn't extract the data from this receipt. This might happen with unclear images or unusual formats.
          </p>
          {receipt.raw_receipt_image_url && (
            <img src={receipt.raw_receipt_image_url} alt="Receipt" className="max-h-64 mx-auto rounded-lg mb-6" />
          )}
          <Button onClick={retryProcessing} className="bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Calculate the actual total from items (price represents line total)
  const displayTotal = receipt.items && receipt.items.length > 0
    ? receipt.items.reduce((sum, item) => sum + (item.total || item.price || 0), 0)
    : (receipt.totalAmount || receipt.total_amount || 0);

  const handleEdit = () => {
    setEditData({ ...receipt });
    loadProductsForEditMode();
    setEditMode(true);
  };

  const totalPotentialSavings = receipt.insights
    ? receipt.insights.reduce((sum, i) => sum + (i.potential_savings || 0), 0)
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Link to={createPageUrl('Home')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                </Link>
                <h2 className="font-bold text-lg text-gray-900">Receipt Details</h2>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleEdit}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
            </div>
        </div>

        {/* Potential Savings Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {totalPotentialSavings > 0 ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-emerald-700 font-medium text-sm uppercase tracking-wide">Potential Savings Found</p>
                        <h3 className="text-3xl font-bold text-emerald-900 mt-1">₪{totalPotentialSavings.toFixed(2)}</h3>
                        <p className="text-emerald-600 text-xs mt-1">Based on market benchmark prices</p>
                    </div>
                    <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <Coins className="w-6 h-6 text-emerald-600" />
                    </div>
                </div>
             ) : (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 font-medium text-sm uppercase tracking-wide">Market Price Analysis</p>
                        <h3 className="text-2xl font-bold text-gray-900 mt-1">Fair Price</h3>
                        <p className="text-gray-400 text-xs mt-1">No significant overpayments detected</p>
                    </div>
                    <div className="h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-gray-400" />
                    </div>
                </div>
             )}

            {/* AI Summary Card */}
            {receipt.summary && (
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-indigo-900 mb-1 flex items-center gap-2 text-sm uppercase tracking-wide">
                      AI Summary
                    </h3>
                    <p className="text-indigo-800 text-sm leading-relaxed">{receipt.summary}</p>
                  </div>
                </div>
              </div>
            )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
          
          {/* Overpay Alert */}
          {receipt.insights?.some(i => i.type === 'OVERPAY_RECEIPT') && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-4">
                  <div className="bg-red-100 p-2 rounded-full">
                      <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                      <h3 className="font-bold text-red-900">Overpayment Detected</h3>
                      <p className="text-red-700 text-sm">
                          {receipt.insights.find(i => i.type === 'OVERPAY_RECEIPT').message}
                      </p>
                  </div>
              </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                              <ShoppingBag className="w-6 h-6" />
                          </div>
                          <div>
                              <h1 className="font-bold text-xl text-gray-900">{receipt.storeName}</h1>
                              <p className="text-sm text-gray-500">{receipt.date}</p>
                          </div>
                      </div>
                      <div className="text-right">
                          <span className="block text-2xl font-bold text-gray-900">₪{displayTotal.toFixed(2)}</span>
                          <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">Paid</span>
                      </div>
                  </div>

                  {/* Items List */}
                  <div className="mt-6">
                      <div className="flex items-center justify-between mb-3">
                         <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Items Purchased</h4>
                         <span className="text-xs text-gray-400">{receipt.items?.length || 0} items</span>
                      </div>
                      
                      {/* Table Header */}
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 border-b border-gray-100 pb-2 mb-2 px-2">
                          <div className="col-span-5">ITEM</div>
                          <div className="col-span-2 text-center">QTY</div>
                          <div className="col-span-2 text-right">PAID</div>
                          <div className="col-span-3 text-right">BENCHMARK</div>
                      </div>

                      <div className="space-y-1">
                          {(receipt.items || []).map((item, idx) => {
                              const benchmark = itemBenchmarks.find(b => b.receipt_line_item_id === item.code); // Assuming item.code links to benchmark line item id, or we might need robust linking
                              const isOverpaid = benchmark && benchmark.overpay_amount > 0;
                              const overpayPercent = benchmark ? ((benchmark.paid_price - benchmark.benchmark_min_price) / benchmark.benchmark_min_price * 100).toFixed(0) : 0;
                              
                              return (
                              <div key={idx} className={`grid grid-cols-12 gap-2 items-center text-sm p-2 rounded-lg transition-colors ${isOverpaid ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                  <div className="col-span-5">
                                      <span className={`font-medium block truncate ${isOverpaid ? 'text-red-900' : 'text-gray-800'}`}>{item.name}</span>
                                      <div className="text-[10px] text-gray-400 truncate">
                                          {item.category} • <span className="font-mono opacity-75">{item.code}</span>
                                      </div>
                                  </div>
                                  <div className="col-span-2 text-center text-gray-500 text-xs">
                                      {item.quantity}
                                  </div>
                                  <div className="col-span-2 text-right font-medium text-gray-900">
                                      ₪{item.price.toFixed(2)}
                                  </div>
                                  <div className="col-span-3 text-right">
                                      {benchmark ? (
                                          <div>
                                              <div className="text-xs text-gray-500">₪{benchmark.benchmark_min_price.toFixed(2)}</div>
                                              {isOverpaid && (
                                                  <div className="text-[10px] text-red-600 font-bold flex items-center justify-end gap-0.5">
                                                      <TrendingDown className="w-3 h-3" /> +{overpayPercent}%
                                                  </div>
                                              )}
                                          </div>
                                      ) : (
                                          <span className="text-xs text-gray-300">-</span>
                                      )}
                                  </div>
                              </div>
                          )})}
                      </div>
                  </div>
              </div>
          </div>
          </div>

          {/* Insights Section - Separate Card on Desktop */}
          <div className="lg:col-span-1 space-y-6">
             {receipt.insights && receipt.insights.length > 0 ? (
                <>
                {/* Savings & Overpay Insights */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 p-4 border-b border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                            <Coins className="w-3 h-3" /> Financial Insights
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {receipt.insights.filter(i => ['OVERPAY_RECEIPT', 'OVERPAY_ITEM', 'saving', 'warning'].includes(i.type)).map((insight, idx) => (
                            <div key={idx} className={`rounded-xl border transition-all ${
                                insight.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                                'bg-red-50 border-red-100 text-red-900'
                            }`}>
                                <div 
                                    className="p-3 flex items-start gap-3 cursor-pointer" 
                                    onClick={() => setExpandedInsight(expandedInsight === idx ? null : idx)}
                                >
                                    {insight.type === 'warning' ? <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600" /> : <TrendingDown className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600" />}
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-sm">{insight.message}</p>
                                            {insight.potential_savings > 0 && (
                                                <Badge variant="outline" className="bg-white border-red-200 text-red-700 font-bold ml-2 whitespace-nowrap">
                                                    Save ₪{insight.potential_savings.toFixed(2)}
                                                </Badge>
                                            )}
                                        </div>
                                        {/* Progressive Disclosure */}
                                        <div className={`text-xs mt-2 overflow-hidden transition-all duration-300 ${expandedInsight === idx ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                            <p className="opacity-90 leading-relaxed mb-2">{insight.explanation_text}</p>
                                            {insight.evidence_json && (
                                                <div className="bg-white/50 rounded p-2 text-[10px] font-mono border border-black/5">
                                                    Evidence: {(() => {
                                                        try {
                                                            const evidence = JSON.parse(insight.evidence_json);
                                                            return Object.entries(evidence).map(([k, v]) => `${k}: ${v}`).join(', ');
                                                        } catch { return 'Details unavailable'; }
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-center mt-1">
                                            {expandedInsight === idx ? <ChevronUp className="w-3 h-3 opacity-30" /> : <ChevronDown className="w-3 h-3 opacity-30" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {receipt.insights.filter(i => ['OVERPAY_RECEIPT', 'OVERPAY_ITEM', 'saving'].includes(i.type)).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-2">No overpayments detected! Good job.</p>
                        )}
                    </div>
                </div>

                {/* What-if / Swaps */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 border-b border-violet-100">
                        <h4 className="text-xs font-semibold text-violet-700 uppercase tracking-wider flex items-center gap-2">
                            <Sparkles className="w-3 h-3" /> "What If" Simulator
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2 mb-3 bg-violet-50/50 p-2 rounded text-xs text-violet-600">
                             <Info className="w-3 h-3" />
                             <span>Hypothetical savings. Does not affect actual spending.</span>
                        </div>
                        {receipt.insights.filter(i => i.type === 'alternative').map((insight, idx) => (
                            <div key={idx} className="p-3 rounded-lg border border-violet-100 bg-white shadow-sm text-violet-900 text-sm">
                                <div className="flex items-start gap-3">
                                    <ArrowRightLeft className="w-5 h-5 mt-0.5 flex-shrink-0 text-violet-500" />
                                    <div>
                                        <p className="font-bold">{insight.message}</p>
                                        <p className="text-xs mt-1 text-gray-600 leading-relaxed">{insight.explanation_text}</p>
                                        {insight.potential_savings > 0 && (
                                            <div className="mt-2 text-xs font-semibold text-violet-600 bg-violet-50 inline-block px-2 py-1 rounded">
                                                Could save ₪{insight.potential_savings.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {receipt.insights.filter(i => i.type === 'alternative').length === 0 && (
                            <p className="text-sm text-gray-400 text-center py-2">No swap opportunities found for this receipt.</p>
                        )}
                    </div>
                </div>
                </>
             ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 text-sm">
                    No specific insights for this receipt.
                </div>
             )}
          </div>
        </div>
    </div>
  );
}