import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, Coins, ArrowLeft, Tag, Download, Loader2, RefreshCw, XCircle, Plus, Trash2, Calendar, Clock, MapPin, CheckCircle2, PackagePlus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PriceComparisonReview from '../components/PriceComparisonReview';
import AddProductDialog from '../components/AddProductDialog';

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

  // Process pending receipt
  const processReceipt = async (r) => {
    if (!r || r.processing_status !== 'pending' || isProcessing) return;
    setIsProcessing(true);

    try {
      const prompt = `
        Analyze this grocery receipt image and extract the data into the following JSON format:
        - storeName: Name of the store
        - date: Date of purchase (YYYY-MM-DD). If missing, use today's date.
        - time: Time of purchase (HH:MM) if available.
        - address: Address of the store if available.
        - totalAmount: Total amount paid
        - items: List of items purchased with product code (if available), name, category (Produce, Dairy, Meat, Snacks, etc), quantity, price (unit price), and total. IMPORTANT: If the receipt shows a price for multiple units of an item, calculate the unit price by dividing that price by the quantity. Ensure 'total' is the line item total (quantity * unit price).
        - insights: Array of insights. 'type' can be "warning" (e.g. unhealthy), "saving" (e.g. bought on sale), or "info". 'message' is the text.
      `;

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [r.raw_receipt_image_url],
        response_json_schema: {
            type: "object",
            properties: {
                storeName: { type: "string" },
                date: { type: "string" },
                time: { type: "string" },
                address: { type: "string" },
                totalAmount: { type: "number" },
                items: { 
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            code: { type: "string" },
                            name: { type: "string" },
                            category: { type: "string" },
                            quantity: { type: "number" },
                            price: { type: "number" },
                            total: { type: "number" }
                        }
                    }
                },
                insights: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            type: { type: "string", enum: ["warning", "saving", "info"] },
                            message: { type: "string" }
                        }
                    }
                }
            },
            required: ["storeName", "totalAmount", "date", "items"]
        }
      });

      await base44.entities.Receipt.update(r.id, {
        ...llmRes,
        processing_status: 'processed'
      });

      const processedReceipt = { ...r, ...llmRes, processing_status: 'processed' };
      
      // If we have a store_id, compare prices with catalog
      if (r.store_id && llmRes.items && llmRes.items.length > 0) {
        try {
          const compareRes = await base44.functions.invoke('comparePrices', {
            items: llmRes.items,
            store_id: r.store_id
          });
          
          setComparisonResults(compareRes.data.results);
          setReceipt(processedReceipt);
          setEditData(processedReceipt);
          setShowPriceComparison(true);
        } catch (error) {
          console.error("Price comparison failed", error);
          // Skip comparison and go to edit mode
          setReceipt(processedReceipt);
          setEditData(processedReceipt);
          setEditMode(true);
        }
      } else {
        // No store selected or no items, skip comparison
        setReceipt(processedReceipt);
        setEditData(processedReceipt);
        setEditMode(true);
      }
    } catch (error) {
      console.error("Processing failed", error);
      await base44.entities.Receipt.update(r.id, { processing_status: 'failed' });
      setReceipt({ ...r, processing_status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    if (!editData) return;
    const newItems = [...editData.items];
    let newItem = { ...newItems[index] };

    if (field === 'quantity' || field === 'price') {
      const numValue = parseFloat(value) || 0;
      newItem[field] = numValue;
      newItem.total = Number((newItem.quantity * newItem.price).toFixed(2));
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
            let adminStatus = user.email === 'liorben@base44.com';
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
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Button>
          </Link>
          <h2 className="font-bold text-lg text-gray-900">Review Receipt</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-12rem)]">
          {/* Receipt Image */}
          {receipt.raw_receipt_image_url && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden h-full sticky top-4">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Scanned Receipt</h3>
              </div>
              <div className="p-4">
                <img 
                  src={receipt.raw_receipt_image_url} 
                  alt="Receipt" 
                  className="w-full rounded-lg border border-gray-200"
                />
              </div>
            </div>
          )}

          {/* Edit Form */}
          <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-6 text-white">
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
              <thead className="text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left font-medium pb-2 pl-2">Code & Item</th>
                  <th className="text-center font-medium pb-2 w-16">Qty</th>
                  <th className="text-center font-medium pb-2 w-20">Price</th>
                  <th className="text-right font-medium pb-2 w-20">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
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
                          className="h-8 text-sm border-gray-200 focus:border-indigo-300 flex-1"
                          placeholder="Item name"
                          disabled={!!dbProduct}
                        />
                        {isAdmin && productNotFound && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setShowAddProduct(item)}
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            title="Add product to database"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      {productNotFound && (
                        <div className="text-[10px] text-amber-600 mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Product not found in database
                        </div>
                      )}
                      <div className="flex gap-1">
                        <Input 
                          value={item.code || ''} 
                          onChange={(e) => handleItemChange(i, 'code', e.target.value)}
                          className="h-6 w-28 text-[10px] text-gray-500 border-gray-100 bg-gray-50"
                          placeholder="Code"
                        />
                        <Input 
                          value={item.category} 
                          onChange={(e) => handleItemChange(i, 'category', e.target.value)}
                          className="h-6 flex-1 text-[10px] text-gray-500 border-transparent bg-gray-50 hover:bg-white hover:border-gray-200 focus:border-indigo-300 transition-all"
                          placeholder="Category"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-1 align-top">
                      <Input 
                        type="number"
                        value={item.quantity} 
                        onChange={(e) => handleItemChange(i, 'quantity', e.target.value)}
                        className="h-8 text-sm text-center px-1 border-gray-200 focus:border-indigo-300"
                        placeholder="Qty"
                      />
                    </td>
                    <td className="py-3 px-1 align-top">
                      <Input 
                        type="number"
                        value={item.price} 
                        onChange={(e) => handleItemChange(i, 'price', e.target.value)}
                        className="h-8 text-sm text-right px-1 border-gray-200 focus:border-indigo-300"
                        placeholder="Price"
                      />
                    </td>
                    <td className="py-3 px-1 align-top">
                      <div className="h-8 flex items-center justify-end px-1 text-sm font-bold text-gray-700">
                        ${(item.total || 0).toFixed(2)}
                      </div>
                    </td>
                    <td className="py-3 pr-1 align-top text-right">
                      <button 
                        onClick={() => handleDeleteItem(i)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
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
                className="w-full text-gray-500 border-dashed border-gray-300 hover:border-indigo-300 hover:text-indigo-600"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Missing Item
              </Button>
            </div>
          </div>
        </div>

        {hasMismatch && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-800 text-sm">Total Mismatch Detected</h4>
              <p className="text-xs text-amber-700 mt-1">
                Sum of items (${calculatedSum.toFixed(2)}) does not match the receipt total (${(editData.totalAmount || 0).toFixed(2)}).
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

  // Calculate the actual total from items
  const displayTotal = receipt.items && receipt.items.length > 0
    ? receipt.items.reduce((sum, item) => sum + (item.total || (item.quantity * item.price) || 0), 0)
    : (receipt.totalAmount || receipt.total_amount || 0);

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Link to={createPageUrl('Home')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                </Link>
                <h2 className="font-bold text-lg text-gray-900">Receipt Details</h2>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
                          <span className="block text-2xl font-bold text-gray-900">${displayTotal.toFixed(2)}</span>
                          <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">Paid</span>
                      </div>
                  </div>

                  {/* Items List */}
                  <div className="mt-6">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Items Purchased</h4>
                      <div className="space-y-3">
                          {(receipt.items || []).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-3">
                                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-medium">
                                          {item.quantity}
                                      </div>
                                      <div>
                                          <span className="font-medium text-gray-800">{item.name}</span>
                                          <div className="text-xs text-gray-400">
                                              <span className="font-mono mr-1 opacity-75">{item.code || 'null'}</span>
                                              • {item.category}
                                          </div>
                                      </div>
                                  </div>
                                  <span className="font-semibold text-gray-900">${item.total.toFixed(2)}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>

          {/* Insights Section - Separate Card on Desktop */}
          <div className="lg:col-span-1">
             {receipt.insights && receipt.insights.length > 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full">
                    <div className="bg-gray-50 p-4 border-b border-gray-100">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                            <Tag className="w-3 h-3" /> AI Smart Insights
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {receipt.insights.map((insight, idx) => (
                            <div 
                                key={idx} 
                                className={`p-3 rounded-lg border text-sm flex items-start gap-3 ${
                                    insight.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' : 
                                    insight.type === 'saving' ? 'bg-green-50 border-green-100 text-green-800' :
                                    'bg-blue-50 border-blue-100 text-blue-800'
                                }`}
                            >
                                {insight.type === 'warning' && <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                                {insight.type === 'saving' && <Coins className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                                <p>{insight.message}</p>
                            </div>
                        ))}
                    </div>
                </div>
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