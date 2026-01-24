import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, AlertCircle, Save, Plus, Trash2, Store, ChevronDown, ChevronUp, ShieldCheck, Image } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from '@/api/base44Client';
import { Badge } from "@/components/ui/badge";

export default function ReceiptReview({ receipt, onConfirm }) {
  const [data, setData] = useState(receipt);
  const [isSaving, setIsSaving] = useState(false);

  const handleMetadataChange = (field, value) => {
    setData({ ...data, [field]: value });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Sync total with price since price IS the total (user requirement)
    if (field === 'price') {
      const val = parseFloat(value);
      newItems[index].total = isNaN(val) ? 0 : val;
    }

    setData({ ...data, items: newItems });
  };

  const handleAddItem = () => {
    const newItem = {
      name: "",
      quantity: 1,
      price: 0,
      total: 0,
      needs_review: true,
      user_confirmed: false
    };
    setData({ ...data, items: [...data.items, newItem] });
  };

  const handleDeleteItem = (index) => {
    const newItems = data.items.filter((_, i) => i !== index);
    setData({ ...data, items: newItems });
  };

  const toggleItemConfirm = (index) => {
    const newItems = [...data.items];
    newItems[index].user_confirmed = !newItems[index].user_confirmed;
    newItems[index].needs_review = false; // Clear review flag if confirmed
    setData({ ...data, items: newItems });
  };

  const handleConfirmAll = async () => {
    setIsSaving(true);
    try {
      // Validate
      if (!data.storeName || !data.date || !data.totalAmount) {
        alert("Please ensure Store Name, Date, and Total Amount are filled.");
        setIsSaving(false);
        return;
      }

      const updatedItems = data.items.map((item) => ({
        ...item,
        price: parseFloat(item.price) || 0,
        quantity: parseFloat(item.quantity) || 0,
        total: parseFloat(item.total) || 0,
        user_confirmed: true,
        needs_review: false
      }));

      const payload = {
        ...data,
        items: updatedItems,
        needs_review: false,
        needs_metadata_review: false,
        processing_status: 'processed'
      };

      // Update DB
      await base44.entities.Receipt.update(receipt.id, payload);

      // Get the current user's email (not created_by which might be app ID)
      const currentUser = await base44.auth.me();
      const userEmail = currentUser?.email;
      console.log("userEmail: ", userEmail)
      
      // Trigger incremental habit and vector updates (sequential: fix IDs, habits, then vectors)
      if (userEmail) {
        console.log("Starting incremental updates for user email:", userEmail);
        base44.functions.invoke('fixHabitUserIds', {})
          .then(res => {
            console.log("[ReceiptReview] fixHabitUserIds result:", res.data);
            console.log("[ReceiptReview] Fixed count:", res.data?.fixed || 0);
            return base44.functions.invoke('rebuildUserHabits', { userId: userEmail, mode: 'incremental' });
          })
          .then(res => {
            console.log("Incremental habit rebuild completed", res.data);
            console.log("Now invoking buildUserVectors for:", userEmail);
            return base44.functions.invoke('buildUserVectors', { userId: userEmail, mode: 'incremental' });
          })
          .then(res => {
            console.log("Incremental vector rebuild completed", res.data);
          })
          .catch(e => {
            console.error("Incremental update failed at step:", e);
          });
      } else {
        console.warn("No user email found, skipping incremental updates");
      }

      // Include the original receipt's created_by in the callback
      if (onConfirm) onConfirm({ ...payload, created_by: receipt.created_by });
    } catch (error) {
      console.error("Failed to confirm receipt", error);
      alert("Failed to save confirmation. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const metadataWarning = data.needs_metadata_review;
  const [showVerifiedItems, setShowVerifiedItems] = useState(false);
  const [showReceiptImage, setShowReceiptImage] = useState(true);

  // Calculate sum of items (using price as it represents line total)
  const calculatedSum = data.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
  const hasMismatch = Math.abs(calculatedSum - (parseFloat(data.totalAmount) || 0)) > 0.05;

  // Separate items needing review from verified items
  const itemsNeedingReview = data.items.filter(item => item.needs_review);
  const verifiedItems = data.items.filter(item => !item.needs_review);
  const reviewCount = itemsNeedingReview.length;
  const verifiedCount = verifiedItems.length;

  // Check if store details are complete
  const storeDetailsVerified = data.storeName && data.date && data.totalAmount;

  return (
    <div className="space-y-4 text-gray-900 dark:text-gray-100">
            {/* Review Status Banner - Dominant */}
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-400/30 dark:border-amber-600/40 p-5 rounded-2xl">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 dark:bg-amber-600/30 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">Quick Review Needed</h3>
                        <p className="text-amber-800/80 dark:text-amber-200/80 text-sm mt-1">
                            Some items need a quick check. Most data is already verified.
                        </p>
                        
                        {/* Checklist Summary */}
                        <div className="mt-4 space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                                {storeDetailsVerified ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                )}
                                <span className={storeDetailsVerified ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
                                    Store details {storeDetailsVerified ? "verified" : "need review"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                <span className="text-green-700 dark:text-green-400">
                                    {verifiedCount} items auto-approved
                                </span>
                            </div>
                            {reviewCount > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                                        {reviewCount} items need review
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Mini Summary */}
            {reviewCount > 0 && (
                <div className="sticky top-0 z-10 bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-3 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-amber-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-200">
                            Review {reviewCount} item{reviewCount !== 1 ? 's' : ''} → Confirm & continue
                        </span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Image Panel */}
                <div className="lg:block">
                    {/* Mobile Toggle */}
                    <button 
                        onClick={() => setShowReceiptImage(!showReceiptImage)}
                        className="lg:hidden w-full flex items-center justify-between p-3 bg-gray-800/50 border border-gray-700/50 rounded-xl mb-3"
                    >
                        <div className="flex items-center gap-2 text-gray-300">
                            <Image className="w-4 h-4" />
                            <span className="text-sm font-medium">Receipt Image</span>
                        </div>
                        {showReceiptImage ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                    
                    <div className={`bg-gray-800/30 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-700/50 dark:border-gray-800 sticky top-16 ${showReceiptImage ? 'block' : 'hidden lg:block'}`} style={{ maxHeight: '75vh' }}>
                        {data.raw_receipt_image_url?.toLowerCase().includes('.pdf') ? (
                            <iframe
                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(data.raw_receipt_image_url)}&embedded=true`}
                                className="w-full h-[70vh]"
                                title="Receipt PDF" 
                            />
                        ) : (
                            <img
                                src={data.raw_receipt_image_url}
                                alt="Receipt"
                                className="w-full h-auto max-h-[70vh] object-contain" 
                            />
                        )}
                    </div>
                </div>

                {/* Form Panel */}
                <div className="space-y-5 overflow-y-auto lg:max-h-[80vh] pr-1 text-gray-900 dark:text-gray-100">
                    
                    {/* Metadata Section */}
                    <Card className={`${metadataWarning ? "border-amber-500/50 dark:border-amber-600/50 bg-amber-500/5" : "border-gray-700/50"} dark:bg-gray-800/50 rounded-xl`}>
                        <CardHeader className="pb-2 pt-4">
                            <CardTitle className="text-sm flex justify-between items-center dark:text-gray-100">
                                <div className="flex items-center gap-2">
                                    <Store className="w-4 h-4 text-gray-400" />
                                    Store Details
                                </div>
                                {storeDetailsVerified ? (
                                    <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">
                                        <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs">Needs review</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wide">Store Name</label>
                                    <Input
                                        value={data.storeName || ''}
                                        onChange={(e) => handleMetadataChange('storeName', e.target.value)}
                                        className={`h-9 dark:bg-gray-900/50 dark:text-gray-100 ${!data.storeName ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-900/20 dark:border-amber-700" : "border-gray-700/50"}`} 
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wide">Date</label>
                                    <Input
                                        type="date"
                                        value={data.date || ''}
                                        onChange={(e) => handleMetadataChange('date', e.target.value)}
                                        className={`h-9 dark:bg-gray-900/50 dark:text-gray-100 ${!data.date ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-900/20 dark:border-amber-700" : "border-gray-700/50"}`} 
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wide">Total Amount</label>
                                    <div className="relative">
                                        <Input
                                            type="number"
                                            value={data.totalAmount || ''}
                                            onChange={(e) => handleMetadataChange('totalAmount', parseFloat(e.target.value))}
                                            className={`h-9 dark:bg-gray-900/50 dark:text-gray-100 ${!data.totalAmount ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-900/20 dark:border-amber-700" : "border-gray-700/50 font-semibold"}`} 
                                        />
                                        <span className="absolute right-3 top-2 text-gray-500 dark:text-gray-500 text-xs">₪</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wide">Currency</label>
                                    <Input
                                        value={data.currency || 'ILS'}
                                        onChange={(e) => handleMetadataChange('currency', e.target.value)}
                                        className="h-9 dark:bg-gray-900/50 dark:text-gray-100 border-gray-700/50" 
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Items Needing Review Section */}
                    {itemsNeedingReview.length > 0 && (
                        <Card className="border-amber-500/40 dark:border-amber-600/40 bg-amber-500/5 dark:bg-amber-900/10 rounded-xl overflow-hidden">
                            <CardHeader className="pb-2 pt-4 bg-amber-500/10 dark:bg-amber-900/20 border-b border-amber-500/20">
                                <CardTitle className="text-sm flex justify-between items-center dark:text-amber-100">
                                    <div className="flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 text-amber-500" />
                                        <span>Items Needing Review</span>
                                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs ml-1">{reviewCount}</Badge>
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-amber-500/10">
                                    {itemsNeedingReview.map((item) => {
                                        const idx = data.items.findIndex(i => i === item);
                                        return (
                                            <div key={idx} className="p-3 hover:bg-amber-500/5 transition-colors">
                                                <div className="flex items-start gap-3">
                                                    <button
                                                        onClick={() => toggleItemConfirm(idx)}
                                                        className="mt-1 text-amber-500 hover:text-amber-400 transition-colors flex-shrink-0"
                                                        title="Mark as reviewed"
                                                    >
                                                        <AlertCircle className="w-5 h-5" />
                                                    </button>
                                                    <div className="flex-1 min-w-0 space-y-2">
                                                        <div>
                                                            <Input
                                                                value={item.name || ''}
                                                                onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                                                                className="h-8 text-sm dark:bg-gray-900/50 dark:text-gray-100 border-amber-500/40 focus:border-amber-400"
                                                                placeholder="Item name"
                                                            />
                                                            {item.raw_text && item.raw_text !== item.name && (
                                                                <div className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-1 truncate" title={item.raw_text}>
                                                                    We weren't fully sure about this item
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <div className="w-20">
                                                                <label className="text-[10px] text-gray-500 mb-0.5 block">Qty</label>
                                                                <Input
                                                                    type="number"
                                                                    value={item.quantity || ''}
                                                                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                                    className="h-7 text-center text-sm dark:bg-gray-900/50 dark:text-gray-100 border-gray-700/50"
                                                                />
                                                            </div>
                                                            <div className="w-24">
                                                                <label className="text-[10px] text-gray-500 mb-0.5 block">Price</label>
                                                                <Input
                                                                    type="number"
                                                                    value={item.price || ''}
                                                                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                                                                    className="h-7 text-right text-sm dark:bg-gray-900/50 dark:text-gray-100 border-gray-700/50 font-medium"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteItem(idx)}
                                                        className="text-gray-500 hover:text-red-400 transition-colors opacity-50 hover:opacity-100 mt-1"
                                                        title="Remove item"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Verified Items Section */}
                    {verifiedItems.length > 0 && (
                        <Card className="border-gray-700/30 dark:bg-gray-800/30 rounded-xl overflow-hidden">
                            <CardHeader className="pb-0 pt-3">
                                <button 
                                    onClick={() => setShowVerifiedItems(!showVerifiedItems)}
                                    className="w-full flex justify-between items-center text-left"
                                >
                                    <CardTitle className="text-sm flex items-center gap-2 dark:text-gray-300">
                                        <CheckCircle2 className="w-4 h-4 text-green-500/70" />
                                        <span className="text-gray-400">Verified Items</span>
                                        <Badge className="bg-green-500/10 text-green-500/80 border-green-500/20 text-xs">{verifiedCount}</Badge>
                                    </CardTitle>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>Looks good — no action needed</span>
                                        {showVerifiedItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </div>
                                </button>
                            </CardHeader>
                            {showVerifiedItems && (
                                <CardContent className="p-0 mt-2">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm table-fixed">
                                            <colgroup>
                                                <col className="w-auto" />
                                                <col className="w-20" />
                                                <col className="w-24" />
                                                <col className="w-10" />
                                            </colgroup>
                                            <thead className="bg-gray-800/30 text-gray-500 dark:text-gray-500 border-y border-gray-700/30 text-xs">
                                                <tr>
                                                    <th className="py-2 px-3 text-left font-medium">Item</th>
                                                    <th className="py-2 px-2 text-right font-medium">Qty</th>
                                                    <th className="py-2 px-2 text-right font-medium">Price</th>
                                                    <th className="py-2 px-2"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700/20">
                                                {verifiedItems.map((item) => {
                                                    const idx = data.items.findIndex(i => i === item);
                                                    return (
                                                        <tr key={idx} className="hover:bg-gray-800/20 transition-colors group">
                                                            <td className="py-2 px-3">
                                                                <div className="flex items-center gap-2">
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500/50 flex-shrink-0" />
                                                                    <Input
                                                                        value={item.name || ''}
                                                                        onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                                                                        className="h-7 text-sm dark:bg-transparent dark:text-gray-300 border-transparent hover:border-gray-700/50 focus:border-gray-600"
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <Input
                                                                    type="number"
                                                                    value={item.quantity || ''}
                                                                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                                    className="h-7 text-right text-sm dark:bg-transparent dark:text-gray-400 border-transparent hover:border-gray-700/50 tabular-nums"
                                                                />
                                                            </td>
                                                            <td className="py-2 px-2">
                                                                <Input
                                                                    type="number"
                                                                    value={item.price || ''}
                                                                    onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                                                                    className="h-7 text-right text-sm dark:bg-transparent dark:text-gray-300 border-transparent hover:border-gray-700/50 font-medium tabular-nums"
                                                                />
                                                            </td>
                                                            <td className="py-2 px-2 text-center">
                                                                <button
                                                                    onClick={() => handleDeleteItem(idx)}
                                                                    className="text-gray-400 hover:text-red-400 transition-colors"
                                                                    title="Remove item"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    )}

                    {/* Add Item Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddItem}
                        className="w-full text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20 border border-dashed border-indigo-700/50 rounded-xl h-10"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Item
                    </Button>

                                                        {hasMismatch && (
                        <div className="bg-amber-500/10 dark:bg-amber-900/20 border border-amber-500/30 dark:border-amber-700/50 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-amber-200">Total doesn't match items</h4>
                                <p className="text-xs text-amber-300/80 mt-1">
                                    Items sum to ₪{calculatedSum.toFixed(2)}, but receipt shows ₪{(parseFloat(data.totalAmount) || 0).toFixed(2)}.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                                onClick={() => handleMetadataChange('totalAmount', calculatedSum)}
                            >
                                Use ₪{calculatedSum.toFixed(2)}
                            </Button>
                        </div>
                    )}

                    {/* Confirm CTA */}
                    <div className="space-y-2 pt-2">
                        <Button
                            onClick={handleConfirmAll}
                            disabled={isSaving}
                            className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-500 rounded-xl shadow-lg shadow-green-900/30"
                        >
                            <ShieldCheck className="mr-2 h-5 w-5" />
                            {isSaving ? "Saving..." : "Confirm & Continue"}
                        </Button>
                        <p className="text-xs text-gray-500 text-center">
                            You can edit this receipt later if needed.
                        </p>
                    </div>
                </div>
            </div>
        </div>);

}