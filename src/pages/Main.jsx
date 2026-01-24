import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package, MapPin, ExternalLink, Info, Lightbulb, HelpCircle, Sparkles, Leaf, Search, RotateCcw, RefreshCw, BarChart3, ChevronDown, ChevronUp, ArrowUpRight, Plus, Calendar, ShoppingBag, Target, Eye, EyeOff } from 'lucide-react';
import { toast } from "sonner";
import DataCorrectionDialog from '@/components/DataCorrectionDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import FrequentItemsCard from '../components/dashboard/FrequentItemsCard';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

function AnalyticsDashboard({ receipts, dashboardData, hideTrends = false }) {
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

  // Calculate category percentages over time (by month)
  const categoryTrendData = (() => {
    // Group receipts by month
    const monthlyData = {};
    
    receipts.forEach(receipt => {
      const date = new Date(receipt.date);
      const monthKey = format(date, 'MMM yyyy');
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { month: monthKey, categories: {}, total: 0, sortDate: date };
      }
      
      if (receipt.items && Array.isArray(receipt.items)) {
        receipt.items.forEach(item => {
          const cat = item.category || 'Other';
          const amount = item.total || item.price || 0;
          monthlyData[monthKey].categories[cat] = (monthlyData[monthKey].categories[cat] || 0) + amount;
          monthlyData[monthKey].total += amount;
        });
      }
    });

    // Get top 5 categories overall
    const allCategoryTotals = {};
    Object.values(monthlyData).forEach(month => {
      Object.entries(month.categories).forEach(([cat, amount]) => {
        allCategoryTotals[cat] = (allCategoryTotals[cat] || 0) + amount;
      });
    });
    
    const topCategories = Object.entries(allCategoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Convert to chart data with percentages
    return Object.values(monthlyData)
      .sort((a, b) => a.sortDate - b.sortDate)
      .slice(-6) // Last 6 months
      .map(month => {
        const dataPoint = { month: month.month };
        topCategories.forEach(cat => {
          const percentage = month.total > 0 ? ((month.categories[cat] || 0) / month.total) * 100 : 0;
          dataPoint[cat] = Math.round(percentage * 10) / 10;
        });
        return dataPoint;
      });
  })();

  const topCategories = categoryTrendData.length > 0 
    ? Object.keys(categoryTrendData[0]).filter(k => k !== 'month')
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hero Metric Card */}
      <Card className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white border-none shadow-xl shadow-indigo-500/20 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 to-transparent"></div>
        <CardContent className="p-6 relative">
          <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider">Spent This Month</p>
          <h2 className="text-4xl font-bold mt-2 tracking-tight">₪{thisMonthTotal.toFixed(2)}</h2>
          {showTrend && (
            <div className="flex items-center mt-3 gap-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${percentChange < 0 ? 'bg-green-500/20 text-green-200' : 'bg-amber-500/20 text-amber-200'}`}>
                <ArrowUpRight className={`w-3 h-3 mr-1 ${percentChange < 0 ? 'rotate-180' : ''}`} />
                {percentChange > 0 ? '+' : ''}{percentChange.toFixed(0)}% vs last month
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secondary Metrics Grid */}
      <section className="grid grid-cols-3 gap-3">
        <Card className="bg-gray-800/50 dark:bg-gray-800/80 border-gray-700/50 shadow-sm hover:bg-gray-800/70 transition-colors">
          <CardContent className="p-4">
            <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">Receipts</p>
            <h2 className="text-xl font-bold text-gray-100 mt-1">{receipts.length}</h2>
            <div className="flex items-center mt-1.5 text-gray-500 text-[10px]">
              <Plus className="w-2.5 h-2.5 mr-1" />
              <span>{thisMonthReceipts.length} this month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 dark:bg-gray-800/80 border-gray-700/50 shadow-sm hover:bg-gray-800/70 transition-colors">
          <CardContent className="p-4">
            <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">Avg Trip</p>
            <h2 className="text-xl font-bold text-gray-100 mt-1">
              ₪{dashboardData?.avgReceiptValue || (receipts.length > 0 ? (totalSpent / receipts.length).toFixed(0) : '0')}
            </h2>
            <div className="flex items-center mt-1.5 text-gray-500 text-[10px]">
              <ShoppingBag className="w-2.5 h-2.5 mr-1" />
              <span>Per visit</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 dark:bg-gray-800/80 border-gray-700/50 shadow-sm hover:bg-gray-800/70 transition-colors">
          <CardContent className="p-4">
            <p className="text-gray-400 text-[10px] font-medium uppercase tracking-wider">30 Days</p>
            <h2 className="text-xl font-bold text-gray-100 mt-1">
              ₪{dashboardData?.last30DaysTotal || '0'}
            </h2>
            <div className="flex items-center mt-1.5 text-gray-500 text-[10px]">
              <Calendar className="w-2.5 h-2.5 mr-1" />
              <span>Recent</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Category Trends Line Chart - Full Width */}
      {categoryTrendData.length > 0 && !hideTrends && (
        <Card className="border-gray-700/50 bg-gray-800/30 shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Category Trends (%)</p>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={categoryTrendData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={35} />
                  <Tooltip 
                    formatter={(value) => `${value}%`}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '12px', backgroundColor: '#1f2937'}}
                    labelStyle={{color: '#e5e7eb'}}
                  />
                  {topCategories.map((cat, idx) => (
                    <Line 
                      key={cat} 
                      type="monotone" 
                      dataKey={cat} 
                      stroke={COLORS[idx % COLORS.length]} 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {topCategories.map((cat, idx) => (
                <span key={idx} className="text-xs flex items-center gap-1.5 text-gray-400">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx] }}></span>
                  {cat}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Frequent Items */}
      {dashboardData?.frequentItems && dashboardData.frequentItems.length > 0 && !hideTrends && (
        <FrequentItemsCard items={dashboardData.frequentItems} />
      )}
    </div>
  );
}

export default function Main() {
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState(null);
  const [candidates, setCandidates] = useState({ chains: [], categories: [], products: [] });
  const [insights, setInsights] = useState([]);
  const [smartTips, setSmartTips] = useState([]); // New Smart Tips
  const [tipsLoading, setTipsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAiInsights, setLoadingAiInsights] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [showSmartTips, setShowSmartTips] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [focusMode, setFocusMode] = useState(false);
  const [showMoreTips, setShowMoreTips] = useState(false);

  const fetchAIInsights = async () => {
    setLoadingAiInsights(true);
    try {
      const response = await base44.functions.invoke('generateDashboardInsights', {});
      if (response.data.success) {
        setAiInsights(response.data.aiInsights);
        setDashboardData(response.data.rawData);
      }
    } catch (error) {
      console.error("Error fetching AI insights", error);
    } finally {
      setLoadingAiInsights(false);
    }
  };

  const fetchReceipts = async (userEmail, isAdmin) => {
    try {
      let data;
      if (isAdmin) {
        data = await base44.entities.Receipt.list('-date', 100);
      } else {
        data = await base44.entities.Receipt.filter({ created_by: userEmail }, '-date', 100);
      }
      setReceipts(data);
    } catch (error) {
      console.error("Error fetching receipts", error);
    }
  };

  const refreshTips = async (currentCandidates = candidates) => {
      setTipsLoading(true);
      try {
          const tipRes = await base44.functions.invoke('generateSmartTips', { recommendations: currentCandidates });
          if (tipRes.data && tipRes.data.tips) {
              setSmartTips(tipRes.data.tips);
          }
      } catch (e) {
          console.error("Smart tips failed", e);
          toast.error("Failed to refresh tips");
      } finally {
          setTipsLoading(false);
      }
  };

  const refreshAll = async () => {
      toast.info("Refreshing insights...");
      await Promise.all([
          fetchAIInsights(),
          refreshTips()
      ]);
      toast.success("Insights refreshed!");
  };

  const handleTipFeedback = async (tip, action) => {
      try {
          await base44.functions.invoke('logSmartTipFeedback', { tip, action });

          if (action === 'like') {
              toast.success("Thanks! We'll show more like this.");
              refreshTips();
          } else if (action === 'dislike') {
              // Remove the disliked tip immediately
              setSmartTips(prev => prev.filter(t => t !== tip));
              toast.info("Tip hidden. Fetching a new one...");
              // Fetch a new tip
              refreshTips();
          }
      } catch (e) {
          console.error(e);
          toast.error("Failed to log feedback");
      }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        // Get Location
        let loc = {};
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            loc = {
                user_lat: position.coords.latitude,
                user_lon: position.coords.longitude
            };
        } catch (e) {
            console.log("Location access denied or timeout");
        }

        // 1. Generate Recommendations
        const res = await base44.functions.invoke('api_createRecommendationRun', { 
            user_id: currentUser.email,
            context: { 
                k_items: 30, 
                k_categories: 5, 
                k_stores: 3,
                ...loc
                // current_store_id could be passed if we knew the user was in a store
            },
            options: { lookback_days: 90 }
        });
        
        if (res.data && res.data.run) {
            setRunId(res.data.run.id);
            // New API returns pre-grouped candidates
            const newCandidates = {
                chains: res.data.candidates.stores || [],
                categories: res.data.candidates.categories || [],
                products: res.data.candidates.items || []
            };
            setCandidates(newCandidates);

            // Generate Smart Tips
            refreshTips(newCandidates);
        }

        // Fetch AI Insights
        fetchAIInsights();

        // Fetch receipts for analytics
        const isAdmin = currentUser.role === 'admin';
        fetchReceipts(currentUser.email, isAdmin);

        // 2. Fetch Insights
        const insightsRes = await base44.entities.Insight.filter({ 
            user_id: currentUser.email, 
            status: 'active' 
        });
        setInsights(insightsRes);

      } catch (error) {
        console.error("Failed to load recommendations", error);
        toast.error("Failed to generate recommendations");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleFeedback = async (candidate, action) => {
      // Optimistic UI update for view action
      if (action === 'click' && candidate.store_chain_id) {
          setSelectedStore(candidate);
      }

      try {
          await base44.functions.invoke('api_logRecommendationFeedback', {
              user_id: user.email,
              run_id: runId,
              candidate_id: candidate.candidate_id,
              action: action,
              context: { page: 'Main' }
          });
          
          if (action === 'dismiss' || action === 'add_to_cart') {
              let type = 'products';
              if (candidate.store_chain_id) type = 'chains';
              else if (candidate.category) type = 'categories';
              
              setCandidates(prev => ({
                  ...prev,
                  [type]: prev[type].filter(c => c !== candidate)
              }));

              if (action === 'add_to_cart') toast.success("Added to cart");
              else toast.info("Recommendation dismissed");
          }
      } catch (e) {
          console.error(e);
      }
  };

  const getMatchQuality = (score) => {
      if (score >= 0.8) return { label: 'Excellent Match', color: 'bg-emerald-500' };
      if (score >= 0.6) return { label: 'Great Match', color: 'bg-green-500' };
      if (score >= 0.4) return { label: 'Good Match', color: 'bg-blue-500' };
      return { label: 'Potential Match', color: 'bg-gray-500' };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <p className="text-gray-500 font-medium">Analyzing your taste profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="space-y-3">
        <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-100">
                    {(() => {
                        const hour = new Date().getHours();
                        if (hour < 12) return 'Good Morning';
                        if (hour < 17) return 'Good Afternoon';
                        return 'Good Evening';
                    })()}{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
                </h1>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full hover:bg-gray-800">
                            <HelpCircle className="h-4 w-4 text-gray-500 hover:text-indigo-400" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-600" />
                                How This Page Works
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2 mb-4">
                            Your personal dashboard combines real-time analytics with AI to help you shop smarter and save money.
                        </p>
                        <div className="space-y-4 text-sm">
                            <div className="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                                <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-slate-600" /> 
                                    Analytics Dashboard
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    Track your spending at a glance with live metrics from your receipts.
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>This Month</strong> — Current spending + % change vs last month</div>
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Total Receipts</strong> — All-time count + new this month</div>
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Avg Receipt</strong> — Your typical trip cost</div>
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>Last 30 Days</strong> — Rolling recent activity</div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                    📈 <strong>Category Trends</strong> shows how your top 5 categories shift over the last 6 months.
                                </p>
                            </div>

                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                                <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-indigo-600" /> 
                                    AI-Powered Insights
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    Our AI analyzes up to 200 of your receipts to find patterns and savings opportunities.
                                </p>
                                <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-500 mt-0.5">✓</span>
                                        <span><strong>Spending Analysis</strong> — Breaks down totals, averages, and category splits</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-500 mt-0.5">✓</span>
                                        <span><strong>Trend Detection</strong> — Compares last 30 days vs previous 30 days</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="text-green-500 mt-0.5">✓</span>
                                        <span><strong>Optimization Tips</strong> — Specific savings recommendations with ₪ estimates</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200 flex items-center gap-2">
                                    <Lightbulb className="w-4 h-4 text-purple-600" />
                                    Smart Tips Engine
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    AI generates 3-5 personalized tips tailored specifically to you.
                                </p>
                                <div className="space-y-2 text-xs">
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-medium">💰 Money Saving</span>
                                        <span className="text-gray-600 dark:text-gray-400">Cheaper alternatives with % savings</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded font-medium">🥗 Health</span>
                                        <span className="text-gray-600 dark:text-gray-400">Diet & allergy-safe suggestions</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded font-medium">🔍 Discovery</span>
                                        <span className="text-gray-600 dark:text-gray-400">Products similar shoppers love</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                                    Tips respect your kosher level, allergies, diet, and budget preferences.
                                </p>
                            </div>
                            
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                    <ThumbsUp className="w-4 h-4 text-amber-600" />
                                    Your Feedback Shapes Everything
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                    Every interaction teaches the system what works for you.
                                </p>
                                <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                                    <li>👍 <strong>Like a tip</strong> → We'll generate more like it</li>
                                    <li>👎 <strong>Dislike a tip</strong> → It's hidden and that style is avoided</li>
                                    <li>📄 <strong>Scan receipts</strong> → Updates your habits and spending analysis</li>
                                </ul>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshAll}
                  disabled={loadingAiInsights || tipsLoading}
                  className="gap-2 border-gray-700 bg-gray-800/50 hover:bg-gray-700 text-gray-300"
                >
                  {(loadingAiInsights || tipsLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <RecommendationExplainer mode="general" />
            </div>
        </div>
        
        {/* Focus Mode Toggle */}
        <div className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${focusMode ? 'bg-indigo-600/20 text-indigo-400' : 'bg-gray-700/50 text-gray-400'}`}>
              {focusMode ? <Target className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-200">Focus Mode</p>
              <p className="text-xs text-gray-500">{focusMode ? 'Showing biggest savings only' : 'Showing all insights'}</p>
            </div>
          </div>
          <Switch 
            checked={focusMode} 
            onCheckedChange={setFocusMode}
            className="data-[state=checked]:bg-indigo-600"
          />
        </div>
      </div>

      {/* Analytics Dashboard Toggle */}
      {!focusMode && (
        <Button
          variant="outline"
          onClick={() => setShowAnalytics(!showAnalytics)}
          className="w-full justify-between border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 text-gray-300"
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics Dashboard
          </span>
          {showAnalytics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      )}

      {/* Analytics Dashboard Content */}
      {showAnalytics && !focusMode && (
        <AnalyticsDashboard receipts={receipts} dashboardData={dashboardData} hideTrends={focusMode} />
      )}

      {/* AI Insights Toggle */}
      {!focusMode && (
        <Button
          variant="outline"
          onClick={() => setShowAiInsights(!showAiInsights)}
          className="w-full justify-between border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 text-gray-300"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI-Powered Insights
            {loadingAiInsights && <Loader2 className="w-3 h-3 animate-spin" />}
          </span>
          {showAiInsights ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      )}

      {/* AI Insights Content */}
      {(showAiInsights || focusMode) && (
        <>
          {loadingAiInsights && (
            <Card className="border-indigo-800/50 bg-indigo-900/20">
              <CardContent className="p-6 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm text-gray-300">AI is analyzing your shopping patterns...</span>
              </CardContent>
            </Card>
          )}

          {aiInsights && !loadingAiInsights && (
            <AIInsightsPanel insights={aiInsights} focusMode={focusMode} />
          )}
        </>
      )}

      {/* Smart Tips Toggle */}
      {!focusMode && (
        <Button
          variant="outline"
          onClick={() => setShowSmartTips(!showSmartTips)}
          className="w-full justify-between border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 text-gray-300"
        >
          <span className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Smart Tips for You
            {tipsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </span>
          {showSmartTips ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      )}

      {/* Smart Tips Content */}
      {(showSmartTips || focusMode) && (
          <section className="space-y-3">
              {/* Tips Header */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Based on your latest receipts, here are the highest-impact tips.
                </p>
              </div>
              
              {tipsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating personalized tips based on your budget and diet...
                  </div>
              ) : smartTips.length > 0 ? (
                  <div className="space-y-3">
                      {/* Show first 2 tips always, rest conditionally */}
                      {smartTips.slice(0, focusMode ? 2 : (showMoreTips ? smartTips.length : 2)).map((tip, i) => {
                          const isSaving = tip.type === 'money_saving';
                          const isHealth = tip.type === 'health_dietary';
                          
                          return (
                            <Card key={i} className={`border-l-4 border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 transition-colors ${
                                isSaving ? 'border-l-green-500' : 
                                isHealth ? 'border-l-emerald-500' : 
                                'border-l-indigo-500'
                            }`}>
                                <CardContent className="p-4 flex gap-4 items-start">
                                    <div className={`p-2 rounded-lg shrink-0 ${
                                        isSaving ? 'bg-green-900/30 text-green-400' :
                                        isHealth ? 'bg-emerald-900/30 text-emerald-400' :
                                        'bg-indigo-900/30 text-indigo-400'
                                    }`}>
                                        {isSaving ? <Tag className="w-5 h-5" /> : 
                                         isHealth ? <Leaf className="w-5 h-5" /> : 
                                         <Lightbulb className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                                                isSaving ? 'bg-green-900/30 text-green-400' :
                                                isHealth ? 'bg-emerald-900/30 text-emerald-400' :
                                                'bg-indigo-900/30 text-indigo-400'
                                            }`}>
                                                {tip.type.replace('_', ' ')}
                                            </span>
                                            {tip.inspired_by_liked_tips && tip.inspired_by_liked_tips.length > 0 && (
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <button className="p-1 text-gray-500 hover:text-indigo-400 hover:bg-gray-700 rounded-full transition-colors" title="Why this tip?">
                                                            <HelpCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
                                                        <DialogHeader>
                                                            <DialogTitle className="flex items-center gap-2">
                                                                <Sparkles className="w-5 h-5 text-indigo-400" />
                                                                Why this tip?
                                                            </DialogTitle>
                                                        </DialogHeader>
                                                        <div className="space-y-3">
                                                            <p className="text-sm text-gray-400">
                                                                This tip was generated based on {tip.inspired_by_liked_tips.length === 1 ? 'a tip' : 'tips'} you previously liked:
                                                            </p>
                                                            <div className="space-y-2">
                                                                {tip.inspired_by_liked_tips.map((likedTip, idx) => (
                                                                    <div key={idx} className="bg-green-900/20 p-3 rounded-lg border border-green-800">
                                                                        <p className="text-sm text-gray-300 italic">"{likedTip}"</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-gray-500">
                                                                We're learning what tips are helpful for you and generating more similar suggestions.
                                                            </p>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            )}
                                        </div>
                                        <p className="text-gray-200 font-medium leading-snug text-sm">
                                            {tip.message}
                                        </p>
                                        {tip.related_entity_name && (
                                            <span className="inline-block mt-2 text-xs bg-gray-700/50 text-gray-300 px-2 py-1 rounded-md border border-gray-600/50" dir="auto">
                                                Related: {tip.related_entity_name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button 
                                            onClick={() => handleTipFeedback(tip, 'like')}
                                            className="p-2 text-gray-500 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                                            title="Helpful"
                                        >
                                            <ThumbsUp className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleTipFeedback(tip, 'dislike')}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                                            title="Not helpful"
                                        >
                                            <ThumbsDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>
                          );
                      })}
                      
                      {/* Show more button */}
                      {smartTips.length > 2 && !focusMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowMoreTips(!showMoreTips)}
                          className="w-full text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                        >
                          {showMoreTips ? (
                            <>
                              <ChevronUp className="w-4 h-4 mr-2" />
                              Show fewer tips
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4 mr-2" />
                              Show {smartTips.length - 2} more tips
                            </>
                          )}
                        </Button>
                      )}
                  </div>
              ) : (
                  <p className="text-sm text-gray-500 p-4">No tips available yet.</p>
              )}
          </section>
      )}

      {/* Legacy Insights (Keep if needed, or remove if redundant) */}
      {insights.length > 0 && !focusMode && (
          <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold mb-3 text-gray-300 uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4 text-yellow-400" /> Additional Insights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.map((insight, i) => (
                       <Card key={i} className="border-gray-700/50 bg-gray-800/30">
                           <CardContent className="p-3">
                               <div className="flex gap-3">
                                   <div className="p-2 bg-yellow-900/30 rounded-lg h-fit shrink-0">
                                       <Lightbulb className="w-4 h-4 text-yellow-400" />
                                   </div>
                                   <div className="min-w-0">
                                       <h3 className="font-semibold text-gray-100 text-sm mb-0.5">{insight.title}</h3>
                                       <p className="text-xs text-gray-400">{insight.message}</p>
                                   </div>
                               </div>
                           </CardContent>
                       </Card>
                  ))}
              </div>
          </section>
      )}





      {/* Empty State */}
      {!loading && candidates.products.length === 0 && candidates.categories.length === 0 && smartTips.length === 0 && !tipsLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-800/30 rounded-xl border-2 border-dashed border-gray-700">
              <div className="bg-gray-800 p-4 rounded-full mb-4">
                  <Search className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">No recommendations yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-2 mb-6">
                  We need a bit more data to personalize your feed. Try searching for products or scanning some receipts!
              </p>
              <Button onClick={() => window.location.reload()} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                  Refresh Page
              </Button>
          </div>
      )}

      {/* Store Details Dialog */}
      <Dialog open={!!selectedStore} onOpenChange={(open) => !open && setSelectedStore(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedStore && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-lg border flex items-center justify-center p-2">
                        {selectedStore.image_url ? 
                            <img src={selectedStore.image_url} alt={selectedStore.name} className="w-full h-full object-contain" /> :
                            <Store className="w-6 h-6 text-indigo-600" />
                        }
                    </div>
                    <div>
                        <DialogTitle>{selectedStore.name}</DialogTitle>
                        <DialogDescription className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                                {Math.round(selectedStore.score * 100)}% Match
                            </Badge>
                        </DialogDescription>
                    </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <h4 className="text-sm font-medium leading-none">Why we recommend this</h4>
                      <div className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex gap-3">
                          <Info className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                          <p>
                              Based on your profile, this chain offers products that align with your dietary preferences and budget goals.
                              {selectedStore.description && <span className="block mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">{selectedStore.description}</span>}
                          </p>
                      </div>
                  </div>
                  
                  {selectedStore.website_url && (
                      <div className="pt-2">
                          <a 
                              href={selectedStore.website_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
                          >
                              Visit Website <ExternalLink className="w-3 h-3" />
                          </a>
                      </div>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>


    </div>
  );
}