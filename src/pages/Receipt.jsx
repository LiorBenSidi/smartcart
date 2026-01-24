import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, Coins, ArrowLeft, Tag, Download, Loader2, RefreshCw, XCircle, Plus, Trash2, Calendar, Clock, MapPin, CheckCircle2, PackagePlus, Sparkles, TrendingDown, ArrowDownRight, ArrowRightLeft, ChevronDown, ChevronUp, Info, FileText, Pencil } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PriceComparisonReview from '../components/PriceComparisonReview';
import AddProductDialog from '../components/AddProductDialog';
import ReceiptReview from '../components/ReceiptReview';
import ReceiptProcessingLoader from '../components/ReceiptProcessingLoader';

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
          // Always set needs_review to true after processing so user reviews first
          updatedReceipt.needs_review = true;
          setReceipt(updatedReceipt);
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

    // Habit and vector updates are now triggered directly in ReceiptReview on "Confirm & Continue"
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
    return editData.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
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
      receipt.items.forEach((item) => {
        rows.push([
        receipt.date,
        `"${receipt.storeName || ''}"`,
        `"${receipt.address || ''}"`,
        receipt.totalAmount || receipt.total_amount || 0,
        `"${item.name}"`,
        item.category,
        item.quantity,
        item.price,
        item.total].
        join(','));
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
      ''].
      join(','));
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
            } catch (e) {
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
      const updatedItems = editData.items.map((item) => {
        const diffIndex = differencesOnly.findIndex((d) => d.item.code === item.code);
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
      const map = new Map(products.map((p) => [p.gtin, p]));
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
      <div className="mx-auto min-h-screen max-w-6xl">
              <div className="flex items-center gap-2 mb-6">
                <Link to={createPageUrl('Upload')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                </Link>
                <h2 className="font-bold text-2xl text-gray-900 dark:text-gray-100">Review Receipt</h2>
              </div>
              <ReceiptReview receipt={receipt} onConfirm={handleReviewConfirm} />
          </div>);

  }

  // Show price comparison review
  if (showPriceComparison && comparisonResults) {
    return (
      <PriceComparisonReview
        comparisonResults={comparisonResults}
        onConfirm={handlePriceComparisonConfirm}
        onCancel={handlePriceComparisonCancel}
        isUpdating={isUpdatingPrices} />);


  }



  // Show pending state
  if (receipt.processing_status === 'pending') {
    return <ReceiptProcessingLoader imageUrl={receipt.raw_receipt_image_url} />;
  }

  // Show failed state
  if (receipt.processing_status === 'failed') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link to={createPageUrl('Upload')}>
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
          receipt.raw_receipt_image_url.toLowerCase().includes('.pdf') ?
          <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(receipt.raw_receipt_image_url)}&embedded=true`} className="w-full max-h-64 h-64 mx-auto rounded-lg mb-6 border-0" title="Receipt PDF" /> :

          <img src={receipt.raw_receipt_image_url} alt="Receipt" className="max-h-64 mx-auto rounded-lg mb-6" />)

          }
          <Button onClick={retryProcessing} className="bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>);

  }

  // Calculate the actual total from items (price represents line total)
  const displayTotal = receipt.items && receipt.items.length > 0 ?
  receipt.items.reduce((sum, item) => sum + (item.total || item.price || 0), 0) :
  receipt.totalAmount || receipt.total_amount || 0;

  const handleEdit = async () => {
    const updated = { ...receipt, needs_review: true };
    setReceipt(updated);
    await base44.entities.Receipt.update(receipt.id, { needs_review: true });
  };

  const totalPotentialSavings = receipt.insights ?
  receipt.insights.reduce((sum, i) => sum + (i.potential_savings || 0), 0) :
  0;

  // UI-only derived values for mini-metrics
  const itemCount = receipt.items?.length || 0;
  const avgPerItem = itemCount > 0 ? displayTotal / itemCount : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
        {/* Success Banner */}
        <div className="bg-emerald-500/10 dark:bg-emerald-900/20 border border-emerald-500/20 dark:border-emerald-600/30 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
                <p className="text-emerald-800 dark:text-emerald-200 font-semibold text-sm">Receipt saved</p>
                <p className="text-emerald-700/70 dark:text-emerald-300/70 text-xs">You can edit anytime. Export CSV when needed.</p>
            </div>
        </div>

        {/* Header with Back + Title + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
                <Link to={createPageUrl('Upload')}>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                        <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </Button>
                </Link>
                <div>
                    <h2 className="font-bold text-xl text-gray-900 dark:text-gray-100">Receipt Details</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Saved from your last scan</p>
                </div>
            </div>
            <div className="flex gap-2 ml-12 sm:ml-0">
                <Button variant="outline" size="sm" onClick={handleEdit} className="gap-2 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <Pencil className="w-4 h-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800" title="Export includes all line items">
                    <Download className="w-4 h-4" /> Export CSV
                </Button>
            </div>
        </div>

        {/* Potential Savings Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {totalPotentialSavings > 0 &&
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-emerald-700 dark:text-emerald-300 font-medium text-sm uppercase tracking-wide">Potential Savings Found</p>
                        <h3 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>₪{totalPotentialSavings.toFixed(2)}</h3>
                        <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-1">Based on market benchmark prices</p>
                    </div>
                    <div className="h-12 w-12 bg-emerald-100 dark:bg-emerald-800 rounded-full flex items-center justify-center">
                        <Coins className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
                    </div>
                </div>
        }

            {/* AI Summary Card */}
            {receipt.summary &&
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-700/50 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-indigo-900 dark:text-indigo-100 mb-1 flex items-center gap-2 text-sm uppercase tracking-wide">
                      AI Summary
                    </h3>
                    <p className="text-indigo-800 dark:text-indigo-200 text-sm leading-relaxed">{receipt.summary}</p>
                  </div>
                </div>
              </div>
        }
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
          
          {/* Overpay Alert */}
          {receipt.insights?.some((i) => i.type === 'OVERPAY_RECEIPT') &&
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-2xl p-4 flex items-center gap-4">
                  <div className="bg-red-100 dark:bg-red-800 p-2 rounded-full">
                      <TrendingDown className="w-6 h-6 text-red-600 dark:text-red-300" />
                  </div>
                  <div>
                      <h3 className="font-bold text-red-900 dark:text-red-100">Overpayment Detected</h3>
                      <p className="text-red-700 dark:text-red-300 text-sm">
                          {receipt.insights.find((i) => i.type === 'OVERPAY_RECEIPT').message}
                      </p>
                  </div>
              </div>
          }

          {/* Main Receipt Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Hero Header */}
              <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                              <ShoppingBag className="w-7 h-7" />
                          </div>
                          <div>
                              <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-50">{receipt.storeName}</h1>
                              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {receipt.date}
                              </p>
                          </div>
                      </div>
                      <div className="text-left sm:text-right flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1">
                          <span className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-50" style={{ fontVariantNumeric: 'tabular-nums' }}>₪{displayTotal.toFixed(2)}</span>
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-1 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Verified
                          </span>
                      </div>
                  </div>

                  {/* Mini Metrics Row */}
                  <div className="flex items-center gap-4 sm:gap-6 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                      <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                              <FileText className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Items</p>
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200" style={{ fontVariantNumeric: 'tabular-nums' }}>{itemCount}</p>
                          </div>
                      </div>
                      <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
                      <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                              <Tag className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Avg/Item</p>
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200" style={{ fontVariantNumeric: 'tabular-nums' }}>₪{avgPerItem.toFixed(2)}</p>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Items Table */}
              <div className="p-5 sm:p-6">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Line Items</h4>
                  
                  {/* Table Header - Fixed width columns */}
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2.5 mb-2">
                      <div className="grid gap-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: '1fr 72px 88px' }}>
                          <div className="pl-1">Item</div>
                          <div className="text-right pr-3">Qty</div>
                          <div className="text-right pr-1">Paid</div>
                      </div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {(receipt.items || []).map((item, idx) => {
                    const benchmark = itemBenchmarks.find((b) => b.receipt_line_item_id === item.code);
                    const isOverpaid = benchmark && benchmark.overpay_amount > 0;

                    return (
                        <div key={idx} className={`grid gap-3 items-center py-3 px-3 rounded-lg transition-colors ${isOverpaid ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`} style={{ gridTemplateColumns: '1fr 72px 88px' }}>
                                    <div className="min-w-0 pl-1">
                                        <span className={`font-medium text-sm block truncate ${isOverpaid ? 'text-red-900 dark:text-red-200' : 'text-gray-800 dark:text-gray-100'}`}>{item.name}</span>
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                            {item.category} <span className="opacity-50">•</span> <span className="font-mono opacity-75">{item.code}</span>
                                        </div>
                                    </div>
                                    <div className="text-right pr-3 text-sm text-gray-600 dark:text-gray-300 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {item.quantity}
                                    </div>
                                    <div className="text-right pr-1 font-semibold text-sm text-gray-900 dark:text-gray-100" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        ₪{item.price.toFixed(2)}
                                    </div>
                                </div>);
                  })}
                      </div>
                  </div>
              </div>
          </div>

          {/* Insights Section - Separate Card on Desktop */}
          <div className="lg:col-span-1 space-y-6">
             {receipt.insights && receipt.insights.length > 0 &&
          <>
                {/* Savings & Overpay Insights */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 p-4 border-b border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                            <Coins className="w-3 h-3" /> Financial Insights
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {receipt.insights.filter((i) => ['OVERPAY_RECEIPT', 'OVERPAY_ITEM', 'saving', 'warning'].includes(i.type)).map((insight, idx) =>
                <div key={idx} className={`rounded-xl border transition-all ${
                insight.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                'bg-red-50 border-red-100 text-red-900'}`
                }>
                                <div
                    className="p-3 flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedInsight(expandedInsight === idx ? null : idx)}>

                                    {insight.type === 'warning' ? <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-600" /> : <TrendingDown className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600" />}
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-sm">{insight.message}</p>
                                            {insight.potential_savings > 0 &&
                        <Badge variant="outline" className="bg-white border-red-200 text-red-700 font-bold ml-2 whitespace-nowrap">
                                                    Save ₪{insight.potential_savings.toFixed(2)}
                                                </Badge>
                        }
                                        </div>
                                        {/* Progressive Disclosure */}
                                        <div className={`text-xs mt-2 overflow-hidden transition-all duration-300 ${expandedInsight === idx ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                            <p className="opacity-90 leading-relaxed mb-2">{insight.explanation_text}</p>
                                            {insight.evidence_json &&
                        <div className="bg-white/50 rounded p-2 text-[10px] font-mono border border-black/5">
                                                    Evidence: {(() => {
                            try {
                              const evidence = JSON.parse(insight.evidence_json);
                              return Object.entries(evidence).map(([k, v]) => `${k}: ${v}`).join(', ');
                            } catch {return 'Details unavailable';}
                          })()}
                                                </div>
                        }
                                        </div>
                                        <div className="flex justify-center mt-1">
                                            {expandedInsight === idx ? <ChevronUp className="w-3 h-3 opacity-30" /> : <ChevronDown className="w-3 h-3 opacity-30" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                )}
                        {receipt.insights.filter((i) => ['OVERPAY_RECEIPT', 'OVERPAY_ITEM', 'saving'].includes(i.type)).length === 0 &&
                <p className="text-sm text-gray-500 text-center py-2">No overpayments detected! Good job.</p>
                }
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
                        {receipt.insights.filter((i) => i.type === 'alternative').map((insight, idx) =>
                <div key={idx} className="p-3 rounded-lg border border-violet-100 bg-white shadow-sm text-violet-900 text-sm">
                                <div className="flex items-start gap-3">
                                    <ArrowRightLeft className="w-5 h-5 mt-0.5 flex-shrink-0 text-violet-500" />
                                    <div>
                                        <p className="font-bold">{insight.message}</p>
                                        <p className="text-xs mt-1 text-gray-600 leading-relaxed">{insight.explanation_text}</p>
                                        {insight.potential_savings > 0 &&
                      <div className="mt-2 text-xs font-semibold text-violet-600 bg-violet-50 inline-block px-2 py-1 rounded">
                                                Could save ₪{insight.potential_savings.toFixed(2)}
                                            </div>
                      }
                                    </div>
                                </div>
                            </div>
                )}
                        {receipt.insights.filter((i) => i.type === 'alternative').length === 0 &&
                <p className="text-sm text-gray-400 text-center py-2">No swap opportunities found for this receipt.</p>
                }
                    </div>
                </div>
                </>
          }
          </div>
        </div>
    </div>);

}