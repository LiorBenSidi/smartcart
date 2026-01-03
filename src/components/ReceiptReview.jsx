import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, AlertCircle, Save } from 'lucide-react';
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
        
        // Auto-recalculate line total if quantity or price changes
        if (field === 'quantity' || field === 'price') {
             const qty = field === 'quantity' ? parseFloat(value) : newItems[index].quantity;
             const price = field === 'price' ? parseFloat(value) : newItems[index].price;
             newItems[index].total = Number((qty * price).toFixed(2));
        }

        // If user manually edits, we can assume they are confirming it (clearing review flag)
        // But let's keep it explicit for now or maybe clear 'needs_review' on edit?
        // newItems[index].needs_review = false; 
        
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

            const updatedItems = data.items.map(item => ({
                ...item,
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
            
            if (onConfirm) onConfirm(payload);
        } catch (error) {
            console.error("Failed to confirm receipt", error);
            alert("Failed to save confirmation. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    const metadataWarning = data.needs_metadata_review;

    return (
        <div className="space-y-6">
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                <div className="flex items-center">
                    <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                    <h3 className="text-amber-800 font-bold">Review Required</h3>
                </div>
                <p className="text-amber-700 text-sm mt-1">
                    Please review the extracted data below. Confirm the store details and check any items marked with a warning.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Image Panel */}
                <div className="bg-gray-100 rounded-xl overflow-hidden shadow-inner border border-gray-200 sticky top-4 h-[80vh]">
                     <img 
                        src={data.raw_receipt_image_url} 
                        alt="Receipt" 
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* Form Panel */}
                <div className="space-y-6 overflow-y-auto h-[80vh] pr-2">
                    
                    {/* Metadata Section */}
                    <Card className={metadataWarning ? "border-amber-300 shadow-amber-50" : ""}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex justify-between items-center">
                                Receipt Details
                                {metadataWarning && <Badge variant="outline" className="text-amber-600 border-amber-300">Check Info</Badge>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Store Name</label>
                                    <Input 
                                        value={data.storeName || ''} 
                                        onChange={(e) => handleMetadataChange('storeName', e.target.value)}
                                        className={!data.storeName ? "border-red-300 bg-red-50" : ""}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Date</label>
                                    <Input 
                                        type="date"
                                        value={data.date || ''} 
                                        onChange={(e) => handleMetadataChange('date', e.target.value)}
                                        className={!data.date ? "border-red-300 bg-red-50" : ""}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Total Amount</label>
                                    <div className="relative">
                                        <Input 
                                            type="number"
                                            value={data.totalAmount || ''} 
                                            onChange={(e) => handleMetadataChange('totalAmount', parseFloat(e.target.value))}
                                            className={!data.totalAmount ? "border-red-300 bg-red-50" : "font-bold"}
                                        />
                                        <span className="absolute right-3 top-2 text-gray-400 text-xs">{data.currency || 'ILS'}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Currency</label>
                                    <Input 
                                        value={data.currency || 'ILS'} 
                                        onChange={(e) => handleMetadataChange('currency', e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Items Section */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Line Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-500 border-b">
                                        <tr>
                                            <th className="py-2 px-3 text-left">Item / Raw Text</th>
                                            <th className="py-2 px-2 text-center w-16">Qty</th>
                                            <th className="py-2 px-2 text-right w-20">Price</th>
                                            <th className="py-2 px-2 text-right w-20">Total</th>
                                            <th className="py-2 px-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {data.items.map((item, idx) => (
                                            <tr key={idx} className={item.needs_review ? "bg-amber-50/50" : ""}>
                                                <td className="p-2">
                                                    <Input 
                                                        value={item.name || ''} 
                                                        onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                                                        className={`h-7 text-sm ${item.needs_review ? "border-amber-300 focus:border-amber-500" : "border-transparent hover:border-gray-200"}`}
                                                    />
                                                    {item.raw_text && item.raw_text !== item.name && (
                                                        <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[200px]" title={item.raw_text}>
                                                            OCR: {item.raw_text}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-2">
                                                    <Input 
                                                        type="number"
                                                        value={item.quantity || ''} 
                                                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                                        className="h-7 text-center px-1"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <Input 
                                                        type="number"
                                                        value={item.price || ''} 
                                                        onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                                                        className="h-7 text-right px-1"
                                                    />
                                                </td>
                                                <td className="p-2 text-right font-medium">
                                                    {(item.total || 0).toFixed(2)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    {item.needs_review ? (
                                                        <button 
                                                            onClick={() => toggleItemConfirm(idx)}
                                                            className="text-amber-500 hover:text-amber-700"
                                                            title="Review needed"
                                                        >
                                                            <AlertCircle className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <Button 
                        onClick={handleConfirmAll} 
                        disabled={isSaving}
                        className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
                    >
                        <Save className="mr-2 h-5 w-5" />
                        {isSaving ? "Saving..." : "Confirm & Continue"}
                    </Button>
                </div>
            </div>
        </div>
    );
}