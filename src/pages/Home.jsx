import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { ArrowUpRight, ShoppingBag, Calendar, ChevronRight, Plus, Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import Onboarding from '../components/Onboarding';

export default function Home() {
  const [receipts, setReceipts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [displayCount, setDisplayCount] = useState(5);
  const [isExporting, setIsExporting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const user = await base44.auth.me();
      // Fetch all receipts for export
      const allReceipts = await base44.entities.Receipt.filter({ created_by: user.email });
      
      const headers = ['Date', 'Store', 'Address', 'Total Amount', 'Item Name', 'Category', 'Quantity', 'Price', 'Item Total'];
      const rows = [];

      allReceipts.forEach(r => {
        if (r.items && r.items.length > 0) {
            r.items.forEach(item => {
                rows.push([
                    r.date,
                    `"${r.storeName}"`,
                    `"${r.address || ''}"`,
                    r.totalAmount,
                    `"${item.name}"`,
                    item.category,
                    item.quantity,
                    item.price,
                    item.total
                ].join(','));
            });
        } else {
             rows.push([
                    r.date,
                    `"${r.storeName}"`,
                    `"${r.address || ''}"`,
                    r.totalAmount,
                    '',
                    '',
                    '',
                    '',
                    ''
                ].join(','));
        }
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `all_receipts_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const handleResize = () => {
        if (window.innerWidth < 640) {
            setDisplayCount(3);
        } else {
            setDisplayCount(5); // Keep 5 or more for larger screens
        }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const auth = await base44.auth.isAuthenticated();
        setIsAuthenticated(auth);
        
        if (!auth) {
            setIsLoading(false);
            return;
        }

        const user = await base44.auth.me();
        console.log('Current User Email:', user.email); // Check if this is the correct email
        let isAdmin = false;
        if (user.role === 'admin') {
            isAdmin = true;
        } else {
            try {
                const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
                console.log('User Profile for Admin Check:', profiles); // Inspect this object
                if (profiles.length > 0 && profiles[0].isAdmin) {
                    isAdmin = true;
                }
            } catch(e) {
                console.error("Error checking admin status", e);
            }
        }
        console.log('Is Current User Admin:', isAdmin); // Confirm this is false for regular users


        // Check if user has a profile
        const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
        setHasProfile(profiles.length > 0);

        // Fetch receipts for stats and list
        // Fetching up to 100 receipts to calculate monthly stats accurately
        let data;
        if (isAdmin) {
            data = await base44.entities.Receipt.list('-date', 100);
        } else {
            data = await base44.entities.Receipt.filter({ created_by: user.email }, '-date', 100);
        }
        setReceipts(data);

        // Extract Insights from receipts for dashboard
        const allInsights = data.flatMap(r => {
             if (!r.insights) return [];
             return r.insights.map(i => ({ ...i, receiptDate: r.date, store: r.storeName, receiptId: r.id }));
        });
        
        // Prioritize savings and overpay warnings
        const topInsights = allInsights
            .filter(i => i.potential_savings > 0 || i.type === 'warning')
            .sort((a, b) => (b.potential_savings || 0) - (a.potential_savings || 0))
            .slice(0, 3);
            
        setInsights(topInsights);

        // Show onboarding if new user (no receipts and no profile)
        if (data.length === 0 && profiles.length === 0) {
            setShowOnboarding(true);
        }
      } catch (error) {
        console.error("Error fetching dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Calculate stats
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getMonth();
  const lastMonthYear = lastMonthDate.getFullYear();

  const thisMonthReceipts = receipts.filter(r => {
    const d = new Date(r.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const lastMonthReceipts = receipts.filter(r => {
    const d = new Date(r.date);
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
  });

  const thisMonthTotal = thisMonthReceipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const lastMonthTotal = lastMonthReceipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

  let percentChange = 0;
  let showTrend = false;

  if (lastMonthTotal > 0) {
      percentChange = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
      showTrend = true;
  }
  
  // Calculate category stats for this month and last month
  const getCategoryTotals = (receiptList) => {
      return receiptList.reduce((acc, receipt) => {
          if (receipt.items) {
              receipt.items.forEach(item => {
                  const cat = item.category || 'Other';
                  acc[cat] = (acc[cat] || 0) + (item.total || 0);
              });
          }
          return acc;
      }, {});
  };

  const thisMonthCats = getCategoryTotals(thisMonthReceipts);
  const lastMonthCats = getCategoryTotals(lastMonthReceipts);

  const allCategories = Array.from(new Set([...Object.keys(thisMonthCats), ...Object.keys(lastMonthCats)]));

  const chartData = allCategories
    .map(cat => ({
      name: cat,
      thisMonth: thisMonthCats[cat] || 0,
      lastMonth: lastMonthCats[cat] || 0,
      thisMonthLabel: format(now, 'MM/yy'),
      lastMonthLabel: format(lastMonthDate, 'MM/yy')
    }))
    .sort((a, b) => b.thisMonth - a.thisMonth)
    .slice(0, displayCount);
    
  // We only want to show the top 5 recent receipts in the list, but we fetched 100 for stats
  const recentReceipts = receipts.slice(0, 5);


  
  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

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
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6 text-indigo-600 dark:text-indigo-400">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-xs">
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

  // Show onboarding for new users
  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-1 md:p-0">
      
      <div className="flex justify-end">
          <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportAll} 
              disabled={isExporting}
              className="text-indigo-600 border-indigo-100 hover:bg-indigo-50"
          >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export All to CSV'}
          </Button>
      </div>

      {/* Overview Cards */}
      <section className="grid grid-cols-2 gap-4 lg:gap-8">
        <Card className="bg-indigo-600 text-white border-none shadow-lg shadow-indigo-200">
          <CardContent className="p-5">
            <p className="text-indigo-100 text-xs font-medium uppercase tracking-wider">Spent This Month</p>
            <h2 className="text-2xl font-bold mt-1">₪{thisMonthTotal.toFixed(2)}</h2>
            {showTrend ? (
              <div className="flex items-center mt-2 text-indigo-200 text-xs">
                <ArrowUpRight className={`w-3 h-3 mr-1 ${percentChange < 0 ? 'rotate-180' : ''}`} />
                <span>{percentChange > 0 ? '+' : ''}{percentChange.toFixed(0)}% vs last month</span>
              </div>
            ) : (
              <div className="h-6"></div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Total Receipts</p>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{receipts.length}</h2>
            <div className="flex items-center mt-2 text-gray-400 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              <span>{thisMonthReceipts.length} new this month</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Top Insights Section */}
      {insights.length > 0 && (
          <section>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Top Savings Opportunities
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {insights.map((insight, idx) => (
                      <Link key={idx} to={`${createPageUrl('Receipt')}?id=${insight.receiptId}`}>
                          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 h-full flex flex-col">
                              <div className="flex items-start justify-between mb-3">
                                  <div className={`p-2 rounded-lg ${
                                      insight.type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                  }`}>
                                      {insight.type === 'warning' ? <AlertCircle className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                  </div>
                                  <span className="text-xs text-gray-400 dark:text-gray-500">{insight.store} • {format(new Date(insight.receiptDate), 'MMM d')}</span>
                              </div>
                              <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">{insight.message}</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 flex-1">{insight.explanation_text}</p>
                              
                              <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-700">
                                  {insight.potential_savings > 0 ? (
                                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                          Save ₪{insight.potential_savings.toFixed(2)}
                                      </span>
                                  ) : (
                                      <span className="text-xs text-gray-400">View Details</span>
                                  )}
                                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                              </div>
                          </div>
                      </Link>
                  ))}
              </div>
          </section>
      )}

      <div className={`grid grid-cols-1 gap-8 ${chartData.length > 0 ? 'lg:grid-cols-3' : ''}`}>
        {/* Spending Chart */}
        {chartData.length > 0 && (
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Spending by Category</h3>
          </div>
          <Card className="border-none shadow-sm bg-white dark:bg-gray-800 overflow-hidden h-[300px] lg:h-[400px]">
            <CardContent className="p-4 pt-8 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={8}>
                  <XAxis
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 12, fill: '#9ca3af'}} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 12, fill: '#9ca3af'}} 
                  />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                    formatter={(value, name) => [`₪${value.toFixed(2)}`, name === 'thisMonth' ? 'This Month' : 'Last Month']}
                  />
                  <Bar dataKey="thisMonth" radius={[4, 4, 0, 0]} name="thisMonth">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.thisMonth <= entry.lastMonth ? '#10b981' : '#ef4444'} />
                    ))}
                    <LabelList dataKey="thisMonthLabel" position="insideBottom" fill="#FFFFFF" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                  </Bar>
                  <Bar dataKey="lastMonth" fill="#1f2937" radius={[4, 4, 0, 0]} name="lastMonth">
                    <LabelList dataKey="lastMonthLabel" position="insideBottom" fill="#FFFFFF" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>
        )}

        {/* Recent Receipts */}
        <section className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Recent Receipts</h3>
            <Link to={createPageUrl('upload')} className="text-xs text-indigo-600 font-semibold hover:underline flex items-center">
              <Plus className="w-3 h-3 mr-1" /> Scan New
            </Link>
          </div>
          
          <div className="space-y-3">
            {recentReceipts.length === 0 ? (
               <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  <ShoppingBag className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No receipts scanned yet.</p>
               </div>
            ) : (
              recentReceipts.map((receipt) => {
                  const isPending = receipt.processingStatus === 'pending';
                  const isFailed = receipt.processingStatus === 'failed';

                  return (
                    <Link key={receipt.id} to={`${createPageUrl('Receipt')}?id=${receipt.id}`}>
                        <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99] ${
                            isPending ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/20' : 
                            isFailed ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/20' : 
                            'border-gray-100 dark:border-gray-700'
                        }`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                                    isPending ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' :
                                    isFailed ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-700' :
                                    'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600'
                                }`}>
                                    {isPending ? (
                                        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                    ) : isFailed ? (
                                        <AlertCircle className="w-5 h-5 text-red-500" />
                                    ) : (
                                        <ShoppingBag className="w-5 h-5 text-gray-500" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                        {isPending ? 'Processing...' : receipt.storeName}
                                    </h4>
                                    <p className={`text-xs ${
                                        isPending ? 'text-indigo-600' :
                                        isFailed ? 'text-red-500' :
                                        'text-gray-500'
                                    }`}>
                                        {isPending ? 'Analyzing receipt...' :
                                         isFailed ? 'Processing failed' :
                                         format(new Date(receipt.date), 'MMM d, yyyy')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {isPending ? (
                                    <span className="text-xs text-indigo-600 font-medium bg-indigo-100 px-2 py-1 rounded-full">
                                        In Progress
                                    </span>
                                ) : isFailed ? (
                                    <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-1 rounded-full flex items-center gap-1">
                                        <RefreshCw className="w-3 h-3" /> Retry
                                    </span>
                                ) : (
                                    <>
                                        <span className="font-bold text-gray-900 dark:text-gray-100">₪{receipt.totalAmount?.toFixed(2)}</span>
                                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                    </>
                                )}
                            </div>
                        </div>
                    </Link>
                  );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}