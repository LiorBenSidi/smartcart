import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package, MapPin, Lightbulb, HelpCircle, Sparkles, Leaf, Search, RotateCcw, RefreshCw, BarChart3, ChevronDown, ChevronUp, ArrowUpRight, Plus, Calendar, ShoppingBag, Target, Eye, EyeOff, CheckCircle } from 'lucide-react';
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


    </div>
  );
}

export default function Main() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [smartTips, setSmartTips] = useState([]); // New Smart Tips
  const [tipsLoading, setTipsLoading] = useState(false);
  const [user, setUser] = useState(null);

  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAiInsights, setLoadingAiInsights] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [showSmartTips, setShowSmartTips] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [focusMode, setFocusMode] = useState(true);
  const [showMoreTips, setShowMoreTips] = useState(false);
  const [addedToCart, setAddedToCart] = useState({});

  const getCacheKey = (type, userEmail) => `cached_${type}_${userEmail || 'anonymous'}`;

  const loadCachedData = (userEmail) => {
    try {
      const cachedInsights = localStorage.getItem(getCacheKey('ai_insights', userEmail));
      const cachedTips = localStorage.getItem(getCacheKey('smart_tips', userEmail));
      
      if (cachedInsights) {
        const parsed = JSON.parse(cachedInsights);
        setAiInsights(parsed.aiInsights);
        setDashboardData(parsed.rawData);
      }
      if (cachedTips) {
        setSmartTips(JSON.parse(cachedTips));
      }
    } catch (e) {
      console.error("Failed to load cached data", e);
    }
  };

  const fetchAIInsights = async (userEmail, skipCache = false) => {
    setLoadingAiInsights(true);
    try {
      const response = await base44.functions.invoke('generateDashboardInsights', {});
      if (response.data.success) {
        setAiInsights(response.data.aiInsights);
        setDashboardData(response.data.rawData);
        // Cache the data per user
        localStorage.setItem(getCacheKey('ai_insights', userEmail), JSON.stringify({
          aiInsights: response.data.aiInsights,
          rawData: response.data.rawData
        }));
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
      localStorage.setItem(getCacheKey('receipts', userEmail), JSON.stringify(data));
    } catch (error) {
      console.error("Error fetching receipts", error);
    }
  };

  const refreshTips = async (userEmail = null) => {
      setTipsLoading(true);
      try {
          const tipRes = await base44.functions.invoke('generateSmartTips', { recommendations: {} });
          if (tipRes.data && tipRes.data.tips) {
              setSmartTips(tipRes.data.tips);
              // Cache the tips per user
              if (userEmail) {
                localStorage.setItem(getCacheKey('smart_tips', userEmail), JSON.stringify(tipRes.data.tips));
              }
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
      const currentUser = await base44.auth.me();
      const isAdmin = currentUser?.role === 'admin';
      const userEmail = currentUser?.email;
      await Promise.all([
          fetchAIInsights(userEmail),
          refreshTips(userEmail),
          fetchReceipts(userEmail, isAdmin)
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

          // Update user vectors incrementally
          if (user?.email) {
              base44.functions.invoke('buildUserVectors', { userId: user.email, mode: 'incremental' })
                  .then(() => console.log("User vectors updated"))
                  .catch(e => console.error("Failed to update user vectors", e));
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

        // Load cached data immediately for instant display (user-specific)
        loadCachedData(currentUser?.email);

        // Load cached receipts first, then fetch fresh data only on refresh (user-specific)
        const cachedReceipts = localStorage.getItem(getCacheKey('receipts', currentUser?.email));
        if (cachedReceipts) {
            setReceipts(JSON.parse(cachedReceipts));
        }

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
                    })()}{user?.display_name ? `, ${user.display_name.split(' ')[0]}` : ''}
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

                            <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-100 dark:border-cyan-800">
                                <h4 className="font-semibold mb-2 text-cyan-900 dark:text-cyan-200 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-cyan-600" />
                                    New User? We've Got You Covered
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    Even without any receipts, you'll still receive personalized recommendations.
                                </p>
                                <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                                    <p>
                                        <strong>How it works:</strong> During onboarding, you shared preferences like budget focus, dietary needs, and household size. 
                                        We use this profile to find users with similar characteristics.
                                    </p>
                                    <p>
                                        Then, we analyze what products those similar users frequently buy, and combine this <strong>collaborative filtering</strong> data 
                                        with your stated preferences to generate tailored shopping recommendations.
                                    </p>
                                    <p className="text-gray-500 dark:text-gray-400 italic">
                                        As you scan receipts, insights become even more accurate and personalized to your actual shopping habits.
                                    </p>
                                </div>
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
        
        {/* Focus Mode Toggle - Subtle */}
        <div className="flex items-center justify-between px-1 py-2">
          <div className="flex items-center gap-2">
            <Target className={`w-3.5 h-3.5 ${focusMode ? 'text-emerald-500' : 'text-gray-500'}`} />
            <p className="text-xs text-gray-500">
              {focusMode ? 'Focused on highest impact' : 'Showing all insights'}
            </p>
          </div>
          <Switch 
            checked={focusMode} 
            onCheckedChange={setFocusMode}
            className="data-[state=checked]:bg-emerald-600 scale-90"
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

          {!loadingAiInsights && (
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
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            <span className="text-xs bg-gray-700/50 text-gray-300 px-2 py-1 rounded-md border border-gray-600/50" dir="auto">
                                                {tip.related_entity_type === 'chain' ? <Store className="w-3 h-3 inline mr-1" /> : <Package className="w-3 h-3 inline mr-1" />}
                                                {tip.related_entity_name}
                                            </span>
                                            {tip.related_entity_type === 'product' && <button 
                                                onClick={async () => {
                                                    const tipKey = `tip-${i}`;
                                                    setAddedToCart(prev => ({ ...prev, [tipKey]: 'loading' }));

                                                    try {
                                                        // Use same search method as EnhancedProductSearch - fetch all products and use Fuse.js style matching
                                                        const allProducts = await base44.entities.Product.list('-updated_date', 1000);
                                                        
                                                        // Use original Hebrew name for search (if available), fallback to display name
                                                        const originalName = tip.related_entity_name_original || tip.related_entity_name;
                                                        const searchTerm = originalName.toLowerCase().trim();
                                                        let matchedProduct = null;
                                                        
                                                        // First try exact match
                                                        matchedProduct = allProducts.find(p => 
                                                            p.canonical_name && p.canonical_name.toLowerCase() === searchTerm
                                                        );
                                                        
                                                        // If no exact match, try includes
                                                        if (!matchedProduct) {
                                                            matchedProduct = allProducts.find(p => 
                                                                p.canonical_name && p.canonical_name.toLowerCase().includes(searchTerm)
                                                            );
                                                        }
                                                        
                                                        // If still no match, try if search term includes product name
                                                        if (!matchedProduct) {
                                                            matchedProduct = allProducts.find(p => 
                                                                p.canonical_name && searchTerm.includes(p.canonical_name.toLowerCase())
                                                            );
                                                        }

                                                        if (matchedProduct) {
                                                            // Get current cart from localStorage
                                                            const existingCart = JSON.parse(localStorage.getItem('smartCartItems') || '[]');
                                                            const existingPrices = JSON.parse(localStorage.getItem('smartCartPrices') || '{}');

                                                            // Check if already in cart
                                                            const existingItem = existingCart.find(item => item.gtin === matchedProduct.gtin);

                                                            if (existingItem) {
                                                                // Increase quantity
                                                                const updatedCart = existingCart.map(item => 
                                                                    item.gtin === matchedProduct.gtin 
                                                                        ? { ...item, quantity: item.quantity + 1 }
                                                                        : item
                                                                );
                                                                localStorage.setItem('smartCartItems', JSON.stringify(updatedCart));
                                                                toast.success(`Increased quantity of "${matchedProduct.canonical_name}"`);
                                                            } else {
                                                                // Add new item
                                                                const newItem = {
                                                                    gtin: matchedProduct.gtin,
                                                                    name: matchedProduct.canonical_name,
                                                                    quantity: 1,
                                                                    fromSuggestion: true
                                                                };
                                                                localStorage.setItem('smartCartItems', JSON.stringify([...existingCart, newItem]));

                                                                // Fetch prices for all chains (same GTIN from different chains)
                                                                const allVariants = allProducts.filter(p => p.gtin === matchedProduct.gtin);
                                                                const pricesByChain = {};
                                                                allVariants.forEach(variant => {
                                                                    if (variant.chain_id && variant.current_price != null) {
                                                                        if (!pricesByChain[variant.chain_id] || variant.current_price < pricesByChain[variant.chain_id].price) {
                                                                            pricesByChain[variant.chain_id] = {
                                                                                price: variant.current_price,
                                                                                chain_id: variant.chain_id,
                                                                                store_id: variant.store_id
                                                                            };
                                                                        }
                                                                    }
                                                                });

                                                                existingPrices[matchedProduct.gtin] = pricesByChain;
                                                                localStorage.setItem('smartCartPrices', JSON.stringify(existingPrices));
                                                                toast.success(`Added "${matchedProduct.canonical_name}" to Smart Cart`);
                                                            }

                                                            setAddedToCart(prev => ({ ...prev, [tipKey]: 'success' }));
                                                        } else {
                                                            toast.error(`Product "${tip.related_entity_name}" not found in catalog`);
                                                            setAddedToCart(prev => ({ ...prev, [tipKey]: null }));
                                                        }
                                                    } catch (error) {
                                                        console.error("Failed to add to cart", error);
                                                        toast.error("Failed to add to cart");
                                                        setAddedToCart(prev => ({ ...prev, [tipKey]: null }));
                                                    }
                                                }}
                                                disabled={addedToCart[`tip-${i}`] === 'loading' || addedToCart[`tip-${i}`] === 'success'}
                                                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all duration-300 ${
                                                    addedToCart[`tip-${i}`] === 'success' 
                                                        ? 'bg-green-600 text-white' 
                                                        : addedToCart[`tip-${i}`] === 'loading'
                                                            ? 'bg-indigo-500 text-white cursor-wait'
                                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                                }`}
                                            >
                                                {addedToCart[`tip-${i}`] === 'loading' ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : addedToCart[`tip-${i}`] === 'success' ? (
                                                    <>
                                                        <CheckCircle className="w-3 h-3" />
                                                        Added!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-3 h-3" />
                                                        Add to Cart
                                                    </>
                                                )}
                                            </button>}
                                        </div>
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
      {!loading && smartTips.length === 0 && !tipsLoading && (
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




    </div>
  );
}