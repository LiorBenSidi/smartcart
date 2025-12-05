import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// import { generateMockReceipt } from "@/components/mockData";
import { UploadCloud, CheckCircle2, ScanLine, Receipt, Loader2, Trash2, Plus } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
      setParsedData(null);
      setIsSaved(false);
    }
  };

  const processReceipt = async () => {
    if (!file) return;
    setIsProcessing(true);
    
    try {
      // 1. Upload the file first
      const uploadRes = await base44.integrations.Core.UploadFile({
        file: file
      });
      const fileUrl = uploadRes.file_url;

      // 2. Process with AI
      const prompt = `
        Analyze this grocery receipt image and extract the data into the following JSON format:
        - storeName: Name of the store
        - date: Date of purchase (YYYY-MM-DD). If missing, use today's date.
        - totalAmount: Total amount paid
        - items: List of items purchased with name, category (Produce, Dairy, Meat, Snacks, etc), quantity (default 1), price (unit price), and total.
        - insights: Array of insights. 'type' can be "warning" (e.g. unhealthy), "saving" (e.g. bought on sale), or "info". 'message' is the text.
      `;

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [fileUrl],
        response_json_schema: {
            type: "object",
            properties: {
                storeName: { type: "string" },
                date: { type: "string" },
                totalAmount: { type: "number" },
                items: { 
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
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

      setParsedData({
          ...llmRes,
          imageUrl: fileUrl
      });

    } catch (error) {
      console.error("Error analyzing receipt", error);
      // Fallback for demo if AI fails
      // setParsedData(generateMockReceipt()); 
    } finally {
      setIsProcessing(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    if (!parsedData) return;
    const newItems = [...parsedData.items];
    
    // Handle numeric fields
    if (field === 'quantity' || field === 'total') {
        newItems[index] = { ...newItems[index], [field]: parseFloat(value) || 0 };
    } else {
        newItems[index] = { ...newItems[index], [field]: value };
    }

    // Recalculate total amount from items
    const newTotalAmount = newItems.reduce((sum, item) => sum + (item.total || 0), 0);

    setParsedData({
        ...parsedData,
        items: newItems,
        totalAmount: newTotalAmount
    });
  };

  const handleDeleteItem = (index) => {
    if (!parsedData) return;
    const newItems = parsedData.items.filter((_, i) => i !== index);
    const newTotalAmount = newItems.reduce((sum, item) => sum + (item.total || 0), 0);
    
    setParsedData({
        ...parsedData,
        items: newItems,
        totalAmount: newTotalAmount
    });
  };

  const handleAddItem = () => {
      if (!parsedData) return;
      const newItem = { name: "New Item", category: "Other", quantity: 1, price: 0, total: 0 };
      setParsedData({
          ...parsedData,
          items: [...parsedData.items, newItem]
      });
  };

  const saveReceipt = async () => {
    if (!parsedData) return;
    
    try {
      await base44.entities.Receipt.create(parsedData);
      setIsSaved(true);
      // In a real app, we'd redirect or show a toast
      setTimeout(() => {
          window.location.href = createPageUrl('Home');
      }, 1500);
    } catch (error) {
      console.error("Failed to save", error);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Scan Receipt</h2>
        <p className="text-gray-500 text-sm">Upload a photo to analyze your groceries</p>
      </div>

      {/* Upload / Preview Area */}
      <Card className="border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden shadow-none hover:border-indigo-300 transition-colors">
        <CardContent className="p-0">
          {!preview ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="h-64 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors p-6"
            >
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-600">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="font-medium text-gray-900">Tap to upload receipt</p>
              <p className="text-xs text-gray-400 mt-2">Supports JPG, PNG</p>
            </div>
          ) : (
            <div className="relative">
              <img src={preview} alt="Receipt" className="w-full object-cover max-h-80 opacity-90" />
              <Button 
                variant="secondary" 
                size="sm" 
                className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-sm hover:bg-white"
                onClick={() => {
                    setPreview(null);
                    setFile(null);
                    setParsedData(null);
                }}
              >
                Retake
              </Button>
            </div>
          )}
          <Input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
        </CardContent>
      </Card>

      {/* Action Buttons or Results */}
      <div className="space-y-4">
        {preview && !parsedData && !isProcessing && (
          <Button onClick={processReceipt} className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-md">
            <ScanLine className="mr-2 w-5 h-5" /> Analyze Receipt
          </Button>
        )}

        {isProcessing && (
          <Button disabled className="w-full h-12 bg-white border border-gray-200 text-gray-900">
            <Loader2 className="mr-2 w-5 h-5 animate-spin text-indigo-600" /> Processing with Gemini...
          </Button>
        )}

        {parsedData && (
          <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-6">
              <div className="bg-indigo-600 px-6 py-4 text-white flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg">{parsedData.storeName}</h3>
                    <p className="text-indigo-100 text-xs opacity-80">{parsedData.date}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-indigo-100 opacity-80">Total</p>
                    <p className="font-bold text-xl">${parsedData.totalAmount.toFixed(2)}</p>
                </div>
              </div>
              
              <div className="p-4 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-100">
                        <tr>
                            <th className="text-left font-medium pb-2 pl-2">Item & Category</th>
                            <th className="text-center font-medium pb-2 w-16">Qty</th>
                            <th className="text-center font-medium pb-2 w-20">Total</th>
                            <th className="w-8"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {parsedData.items.map((item, i) => (
                            <tr key={i} className="group">
                                <td className="py-3 pl-2 align-top">
                                    <Input 
                                        value={item.name} 
                                        onChange={(e) => handleItemChange(i, 'name', e.target.value)}
                                        className="h-8 text-sm mb-1 border-gray-200 focus:border-indigo-300"
                                        placeholder="Item name"
                                    />
                                    <Input 
                                        value={item.category} 
                                        onChange={(e) => handleItemChange(i, 'category', e.target.value)}
                                        className="h-6 text-[10px] text-gray-500 border-transparent bg-gray-50 hover:bg-white hover:border-gray-200 focus:border-indigo-300 transition-all"
                                        placeholder="Category"
                                    />
                                </td>
                                <td className="py-3 px-1 align-top">
                                     <Input 
                                        type="number"
                                        value={item.quantity} 
                                        onChange={(e) => handleItemChange(i, 'quantity', e.target.value)}
                                        className="h-8 text-sm text-center px-1 border-gray-200 focus:border-indigo-300"
                                    />
                                </td>
                                <td className="py-3 px-1 align-top">
                                     <Input 
                                        type="number"
                                        value={item.total} 
                                        onChange={(e) => handleItemChange(i, 'total', e.target.value)}
                                        className="h-8 text-sm text-right px-1 font-medium border-gray-200 focus:border-indigo-300"
                                    />
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
                        ))}
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

            {!isSaved ? (
                <Button onClick={saveReceipt} className="w-full h-12 bg-green-600 hover:bg-green-700 shadow-md text-white">
                    <CheckCircle2 className="mr-2 w-5 h-5" /> Save & Continue
                </Button>
            ) : (
                <Button disabled className="w-full h-12 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="mr-2 w-5 h-5" /> Saved Successfully!
                </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}