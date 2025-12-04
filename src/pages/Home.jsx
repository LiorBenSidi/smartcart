import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUpRight, ShoppingBag, Calendar, ChevronRight, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function Home() {
  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const auth = await base44.auth.isAuthenticated();
        setIsAuthenticated(auth);
        
        if (!auth) {
            setIsLoading(false);
            return;
        }
        
        // Fetch recent receipts
        // list takes (sort, limit) as arguments, not an object
        const data = await base44.entities.Receipt.list('-date', 5);
        setReceipts(data);
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate stats
  const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const monthlyAverage = totalSpent / (receipts.length || 1); // simplified mock logic

  // Mock chart data based on categories
  const chartData = [
    { name: 'Prod', value: 120 },
    { name: 'Meat', value: 85 },
    { name: 'Dairy', value: 45 },
    { name: 'Snack', value: 30 },
  ];
  
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981'];

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
        <p className="text-gray-500 mb-8 max-w-xs">
          Please sign in to view your dashboard and grocery insights.
        </p>
        <Button 
          onClick={() => base44.auth.redirectToLogin()}
          className="w-full max-w-xs bg-indigo-600 hover:bg-indigo-700 shadow-lg"
        >
          Sign In to Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Overview Cards */}
      <section className="grid grid-cols-2 gap-4">
        <Card className="bg-indigo-600 text-white border-none shadow-lg shadow-indigo-200">
          <CardContent className="p-5">
            <p className="text-indigo-100 text-xs font-medium uppercase tracking-wider">Total Spent</p>
            <h2 className="text-2xl font-bold mt-1">${totalSpent.toFixed(2)}</h2>
            <div className="flex items-center mt-2 text-indigo-200 text-xs">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              <span>+12% this month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Receipts</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">{receipts.length}</h2>
            <div className="flex items-center mt-2 text-gray-400 text-xs">
              <Calendar className="w-3 h-3 mr-1" />
              <span>Last 30 days</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Spending Chart */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Spending by Category</h3>
        </div>
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <CardContent className="p-4 pt-8">
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 12, fill: '#9ca3af'}} 
                    dy={10}
                  />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Recent Receipts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Recent Receipts</h3>
          <Link to={createPageUrl('upload')} className="text-xs text-indigo-600 font-semibold hover:underline flex items-center">
            <Plus className="w-3 h-3 mr-1" /> Scan New
          </Link>
        </div>
        
        <div className="space-y-3">
          {receipts.length === 0 ? (
             <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200">
                <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No receipts scanned yet.</p>
             </div>
          ) : (
            receipts.map((receipt) => (
                <Link key={receipt.id} to={`${createPageUrl('Receipt')}?id=${receipt.id}`}>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99]">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100">
                                <ShoppingBag className="w-5 h-5 text-gray-500" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-gray-900 text-sm">{receipt.storeName}</h4>
                                <p className="text-gray-500 text-xs">{format(new Date(receipt.date), 'MMM d, yyyy')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900">${receipt.totalAmount?.toFixed(2)}</span>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>
                    </div>
                </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}