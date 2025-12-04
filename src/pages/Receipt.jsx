import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, AlertTriangle, Coins, ArrowLeft, Tag } from 'lucide-react';
import { Button } from "@/components/ui/button";

export default function Receipt() {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReceipt = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('id');
      if (id) {
        try {
            const data = await base44.entities.Receipt.filter({ id });
            if (data.length > 0) setReceipt(data[0]);
        } catch (e) {
            console.error("Error loading receipt", e);
        }
      }
      setLoading(false);
    };
    fetchReceipt();
  }, []);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading receipt...</div>;
  if (!receipt) return <div className="p-10 text-center text-gray-500">Receipt not found.</div>;

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
            <Link to={createPageUrl('Home')}>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Button>
            </Link>
            <h2 className="font-bold text-lg text-gray-900">Receipt Details</h2>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50">
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
                                        <div className="text-xs text-gray-400">{item.category}</div>
                                    </div>
                                </div>
                                <span className="font-semibold text-gray-900">${item.total.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Insights Section */}
            {receipt.insights && receipt.insights.length > 0 && (
                <div className="bg-gray-50 p-6">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Tag className="w-3 h-3" /> AI Smart Insights
                    </h4>
                    <div className="space-y-3">
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
            )}
        </div>
    </div>
  );
}