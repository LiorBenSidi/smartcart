import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, Coins, ArrowLeft, Tag, Download, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function Receipt() {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Process pending receipt
  const processReceipt = async (r) => {
    if (!r || r.processingStatus !== 'pending' || isProcessing) return;
    setIsProcessing(true);

    try {
      const prompt = `
        Analyze this grocery receipt image and extract the data into the following JSON format:
        - storeName: Name of the store
        - date: Date of purchase (YYYY-MM-DD). If missing, use today's date.
        - time: Time of purchase (HH:MM) if available.
        - address: Address of the store if available.
        - totalAmount: Total amount paid
        - items: List of items purchased with product code (if available), name, category (Produce, Dairy, Meat, Snacks, etc), quantity (default 1), price (unit price), and total.
        - insights: Array of insights. 'type' can be "warning" (e.g. unhealthy), "saving" (e.g. bought on sale), or "info". 'message' is the text.
      `;

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        file_urls: [r.imageUrl],
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
        processingStatus: 'processed'
      });

      setReceipt({ ...r, ...llmRes, processingStatus: 'processed' });
    } catch (error) {
      console.error("Processing failed", error);
      await base44.entities.Receipt.update(r.id, { processingStatus: 'failed' });
      setReceipt({ ...r, processingStatus: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportCSV = () => {
    if (!receipt) return;

    const headers = ['Date', 'Store', 'Address', 'Total Amount', 'Item Name', 'Category', 'Quantity', 'Price', 'Item Total'];
    const rows = [];

    if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach(item => {
            rows.push([
                receipt.date,
                `"${receipt.storeName}"`,
                `"${receipt.address || ''}"`,
                receipt.totalAmount,
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
                `"${receipt.storeName}"`,
                `"${receipt.address || ''}"`,
                receipt.totalAmount,
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
    link.setAttribute("download", `receipt_${receipt.storeName}_${receipt.date}.csv`);
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
            let isAdmin = user.email === 'liorben@base44.com';
            if (!isAdmin) {
                try {
                    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
                    if (profiles.length > 0 && profiles[0].isAdmin) {
                        isAdmin = true;
                    }
                } catch(e) {
                    console.error("Error checking admin status", e);
                }
            }

            let data;
            if (isAdmin) {
                data = await base44.entities.Receipt.filter({ id });
            } else {
                data = await base44.entities.Receipt.filter({ id, created_by: user.email });
            }

            if (data.length > 0) {
              setReceipt(data[0]);
              // If pending, trigger processing
              if (data[0].processingStatus === 'pending') {
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

    const updatedReceipt = { ...receipt, processingStatus: 'pending' };
    setReceipt(updatedReceipt);
    await base44.entities.Receipt.update(receipt.id, { processingStatus: 'pending' });
    processReceipt(updatedReceipt);
  };

  if (loading) return <div className="p-10 text-center text-gray-500">Loading receipt...</div>;
  if (!receipt) return <div className="p-10 text-center text-gray-500">Receipt not found.</div>;

  // Show pending state
  if (receipt.processingStatus === 'pending') {
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
          {receipt.imageUrl && (
            <img src={receipt.imageUrl} alt="Receipt" className="max-h-64 mx-auto rounded-lg opacity-50" />
          )}
        </div>
      </div>
    );
  }

  // Show failed state
  if (receipt.processingStatus === 'failed') {
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
          {receipt.imageUrl && (
            <img src={receipt.imageUrl} alt="Receipt" className="max-h-64 mx-auto rounded-lg mb-6" />
          )}
          <Button onClick={retryProcessing} className="bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className="w-4 h-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

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
                          <span className="block text-2xl font-bold text-gray-900">${receipt.totalAmount.toFixed(2)}</span>
                          <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">Paid</span>
                      </div>
                  </div>

                  {/* Items List */}
                  <div className="mt-6">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Items Purchased</h4>
                      <div className="space-y-3">
                          {receipt.items.map((item, idx) => (
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