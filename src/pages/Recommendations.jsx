import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package, MapPin, ExternalLink, Info, Lightbulb, HelpCircle, Sparkles, Leaf, Search, RotateCcw, RefreshCw, BarChart3, ChevronDown, ChevronUp, ArrowUpRight, Plus, Calendar, ShoppingBag } from 'lucide-react';
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
import UserSimilarityDisplay from "@/components/UserSimilarityDisplay";
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import FrequentItemsCard from '../components/dashboard/FrequentItemsCard';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];

function AnalyticsDashboard({ receipts, dashboardData }) {
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
      {/* Overview Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Avg Receipt</p>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              ₪{dashboardData?.avgReceiptValue || (receipts.length > 0 ? (totalSpent / receipts.length).toFixed(2) : '0.00')}
            </h2>
            <div className="flex items-center mt-2 text-gray-400 text-xs">
              <ShoppingBag className="w-3 h-3 mr-1" />
              <span>Per shopping trip</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">Last 30 Days</p>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              ₪{dashboardData?.last30DaysTotal || '0.00'}
            </h2>
            <div className="flex items-center mt-2 text-gray-400 text-xs">
              <Calendar className="w-3 h-3 mr-1" />
              <span>Recent spending</span>
            </div>
          </CardContent>
        </Card>


      </section>

      {/* Category Trends Line Chart - Full Width */}
      {categoryTrendData.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardContent className="p-5">
            <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">Category Trends (%)</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={categoryTrendData}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={35} />
                  <Tooltip 
                    formatter={(value) => `${value}%`}
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px'}}
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
                <span key={idx} className="text-xs flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx] }}></span>
                  {cat}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Frequent Items */}
      {dashboardData?.frequentItems && dashboardData.frequentItems.length > 0 && (
        <FrequentItemsCard items={dashboardData.frequentItems} />
      )}
    </div>
  );
}

export default function Recommendations() {
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState(null);
  const [candidates, setCandidates] = useState({ chains: [], categories: [], products: [] });
  const [insights, setInsights] = useState([]);
  const [smartTips, setSmartTips] = useState(() => {
    const saved = localStorage.getItem('smartTips');
    return saved ? JSON.parse(saved) : [];
  }); // New Smart Tips
  const [tipsLoading, setTipsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [aiInsights, setAiInsights] = useState(() => {
    const saved = localStorage.getItem('aiInsights');
    return saved ? JSON.parse(saved) : null;
  });
  const [loadingAiInsights, setLoadingAiInsights] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [showSmartTips, setShowSmartTips] = useState(false);
  const [dashboardData, setDashboardData] = useState(() => {
    const saved = localStorage.getItem('dashboardData');
    return saved ? JSON.parse(saved) : null;
  });
  const [receipts, setReceipts] = useState([]);
  const [smartTipsLoaded, setSmartTipsLoaded] = useState(false);

  const fetchAIInsights = async () => {
    setLoadingAiInsights(true);
    try {
      const response = await base44.functions.invoke('generateDashboardInsights', {});
      if (response.data.success) {
        setAiInsights(response.data.aiInsights);
        setDashboardData(response.data.rawData);
        localStorage.setItem('aiInsights', JSON.stringify(response.data.aiInsights));
        localStorage.setItem('dashboardData', JSON.stringify(response.data.rawData));
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
              localStorage.setItem('smartTips', JSON.stringify(tipRes.data.tips));
          }
      } catch (e) {
          console.error("Smart tips failed", e);
          toast.error("Failed to refresh tips");
      } finally {
          setTipsLoading(true);
          setSmartTipsLoaded(true);
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

            // Generate Smart Tips only if not already loaded from localStorage
            const savedTips = localStorage.getItem('smartTips');
            if (!savedTips || JSON.parse(savedTips).length === 0) {
                refreshTips(newCandidates);
            } else {
                setSmartTipsLoaded(true);
            }
        }

        // Fetch AI Insights only if not already cached
        if (!aiInsights) {
            fetchAIInsights();
        }

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
              context: { page: 'Recommendations' }
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
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      {/* Page Header - For You */}
      <div className="space-y-2">
        <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">For You</h1>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                            <HelpCircle className="h-5 w-5 text-gray-400 hover:text-indigo-600" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-600" />
                                How This Page Works - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div className="bg-slate-50 dark:bg-slate-900/20 p-3 rounded border border-slate-100 dark:border-slate-800">
                                <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" /> 
                                    Analytics Dashboard
                                </h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                                    Displays your shopping statistics and spending patterns:
                                </p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>Spent This Month:</strong> Total spending for the current calendar month with percentage change vs. last month.</li>
                                    <li><strong>Total Receipts:</strong> Count of all uploaded receipts and how many were added this month.</li>
                                    <li><strong>Avg Receipt:</strong> Your average spending per shopping trip.</li>
                                    <li><strong>Last 30 Days:</strong> Rolling 30-day spending total for recent activity tracking.</li>
                                    <li><strong>Category Trends:</strong> Line chart showing how your top 5 category percentages change over the last 6 months.</li>
                                    <li><strong>Frequent Items:</strong> Your most purchased products by frequency and total spend.</li>
                                </ul>
                            </div>

                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded border border-indigo-100 dark:border-indigo-800">
                                <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> 
                                    AI-Powered Insights
                                </h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                                    Analyzes up to 200 of your recent receipts to generate personalized financial insights:
                                </p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>Spending Analysis:</strong> Aggregates total spending, average receipt value, and category breakdowns from your purchase history.</li>
                                    <li><strong>Trend Detection:</strong> Compares your last 30 days spending vs. the previous 30 days to identify spending trends.</li>
                                    <li><strong>Frequent Items:</strong> Identifies your top 10 most purchased products by frequency and total spend.</li>
                                    <li><strong>Optimization Opportunities:</strong> AI generates specific savings recommendations with estimated amounts based on your actual data.</li>
                                </ul>
                            </div>

                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">Smart Tips Engine</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs">A Generative AI model creates 3-5 personalized tips based on:</p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li><strong>Your Profile:</strong> Diet, kosher level, allergies, budget focus, household size, and health preferences.</li>
                                        <li><strong>Purchase Habits:</strong> Your top 5 most confident product habits by purchase frequency.</li>
                                        <li><strong>Current Recommendations:</strong> Products and stores being recommended to you.</li>
                                        <li><strong>Feedback Learning:</strong> Tips you've liked or disliked are stored and used to generate more relevant suggestions.</li>
                                    </ul>
                                    <p className="text-xs mt-2">
                                        <strong>Tip Types:</strong> Money Saving (cheaper alternatives), Health & Dietary (compliance-verified suggestions), and Discovery (products similar users buy).
                                    </p>
                                </div>
                            </div>
                            
                            
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">Your Feedback Matters</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Every interaction helps personalize your experience:</p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>Thumbs Up/Down on Tips:</strong> Liked tips are saved and used to inspire future tip generation. Disliked tips are filtered out.</li>
                                    <li><strong>Product Feedback:</strong> Thumbs up/down and dismissals are logged to refine future product recommendations.</li>
                                    <li><strong>Receipt Scans:</strong> Verified purchases update your habit vectors and spending analysis.</li>
                                </ul>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshAll}
                  disabled={loadingAiInsights || tipsLoading}
                  className="gap-2"
                >
                  {(loadingAiInsights || tipsLoading) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh All
                </Button>
                <RecommendationExplainer mode="general" />
            </div>
        </div>
        <p className="text-gray-500 dark:text-gray-400">AI-powered insights, smart tips, and personalized recommendations based on your shopping habits.</p>
      </div>

      {/* Analytics Dashboard Toggle */}
      <Button
        variant="outline"
        onClick={() => setShowAnalytics(!showAnalytics)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Analytics Dashboard
        </span>
        {showAnalytics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {/* Analytics Dashboard Content */}
      {showAnalytics && (
        <AnalyticsDashboard receipts={receipts} dashboardData={dashboardData} />
      )}

      {/* AI Insights Toggle */}
      <Button
        variant="outline"
        onClick={() => setShowAiInsights(!showAiInsights)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          AI-Powered Insights
          {loadingAiInsights && <Loader2 className="w-3 h-3 animate-spin" />}
        </span>
        {showAiInsights ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {/* AI Insights Content */}
      {showAiInsights && (
        <>
          {loadingAiInsights && (
            <Card className="border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800">
              <CardContent className="p-6 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">AI is analyzing your shopping patterns...</span>
              </CardContent>
            </Card>
          )}

          {aiInsights && !loadingAiInsights && (
            <AIInsightsPanel insights={aiInsights} />
          )}
        </>
      )}

      {/* Smart Tips Toggle */}
      <Button
        variant="outline"
        onClick={() => setShowSmartTips(!showSmartTips)}
        className="w-full justify-between"
      >
        <span className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Smart Tips for You
          {tipsLoading && <Loader2 className="w-3 h-3 animate-spin" />}
        </span>
        {showSmartTips ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {/* Smart Tips Content */}
      {showSmartTips && (
          <section>
              {tipsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating personalized tips based on your budget and diet...
                  </div>
              ) : smartTips.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                      {smartTips.map((tip, i) => {
                          const isSaving = tip.type === 'money_saving';
                          const isHealth = tip.type === 'health_dietary';
                          
                          return (
                            <Card key={i} className={`border-l-4 ${
                                isSaving ? 'border-l-green-500 border-green-100 bg-green-50/20' : 
                                isHealth ? 'border-l-emerald-500 border-emerald-100 bg-emerald-50/20' : 
                                'border-l-indigo-500 border-indigo-100 bg-indigo-50/20'
                            }`}>
                                <CardContent className="p-4 flex gap-4 items-start">
                                    <div className={`p-2 rounded-full shrink-0 ${
                                        isSaving ? 'bg-green-100 text-green-600' :
                                        isHealth ? 'bg-emerald-100 text-emerald-600' :
                                        'bg-indigo-100 text-indigo-600'
                                    }`}>
                                        {isSaving ? <Tag className="w-5 h-5" /> : 
                                         isHealth ? <Leaf className="w-5 h-5" /> : 
                                         <Lightbulb className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm uppercase tracking-wide opacity-70">
                                                {tip.type.replace('_', ' ')}
                                            </h3>
                                            {tip.inspired_by_liked_tips && tip.inspired_by_liked_tips.length > 0 && (
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <button className="p-1 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-full transition-colors" title="Why this tip?">
                                                            <HelpCircle className="w-4 h-4" />
                                                        </button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
                                                        <DialogHeader>
                                                            <DialogTitle className="flex items-center gap-2">
                                                                <Sparkles className="w-5 h-5 text-indigo-600" />
                                                                Why this tip?
                                                            </DialogTitle>
                                                        </DialogHeader>
                                                        <div className="space-y-3">
                                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                This tip was generated based on {tip.inspired_by_liked_tips.length === 1 ? 'a tip' : 'tips'} you previously liked:
                                                            </p>
                                                            <div className="space-y-2">
                                                                {tip.inspired_by_liked_tips.map((likedTip, idx) => (
                                                                    <div key={idx} className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-800">
                                                                        <p className="text-sm text-gray-700 dark:text-gray-300 italic">"{likedTip}"</p>
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
                                        <p className="text-gray-800 dark:text-gray-200 font-medium leading-snug">
                                            {tip.message}
                                        </p>
                                        {tip.related_entity_name && (
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                <span className="inline-block text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full font-medium border border-indigo-200 dark:border-indigo-700">
                                                    🏷️ {tip.related_entity_name}
                                                </span>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs gap-1 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400"
                                                    onClick={() => {
                                                        // Navigate to SmartCart with the product name to search
                                                        const url = new URL(window.location.origin);
                                                        url.pathname = '/smartcart';
                                                        url.searchParams.set('search', tip.related_entity_name);
                                                        window.location.href = url.toString();
                                                    }}
                                                >
                                                    <ShoppingCart className="w-3 h-3" />
                                                    Add to Cart
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-1 ml-auto shrink-0">
                                        <button 
                                            onClick={() => handleTipFeedback(tip, 'like')}
                                            className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                            title="Helpful"
                                        >
                                            <ThumbsUp className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleTipFeedback(tip, 'dislike')}
                                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="Not helpful"
                                        >
                                            <ThumbsDown className="w-4 h-4" />
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>
                          );
                      })}
                  </div>
              ) : (
                  <p className="text-sm text-gray-500 p-4">No tips available yet.</p>
              )}
          </section>
      )}

      {/* Legacy Insights (Keep if needed, or remove if redundant) */}
      {insights.length > 0 && (
          <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                  <Lightbulb className="w-5 h-5 text-yellow-500" /> Additional Insights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {insights.map((insight, i) => (
                       <Card key={i} className="border-yellow-100 bg-yellow-50/30 dark:bg-yellow-900/10 dark:border-yellow-900/30">
                           <CardContent className="p-4">
                               <div className="flex gap-3">
                                   <div className="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg h-fit">
                                       <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                                   </div>
                                   <div>
                                       <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">{insight.title}</h3>
                                       <p className="text-sm text-gray-600 dark:text-gray-300">{insight.message}</p>
                                   </div>
                               </div>
                           </CardContent>
                       </Card>
                  ))}
              </div>
          </section>
      )}

      <UserSimilarityDisplay currentUser={user} learningSnippet={insights.find(i => i.type === 'ShopperTwins')?.message} />



      {/* Empty State */}
      {!loading && candidates.products.length === 0 && candidates.categories.length === 0 && smartTips.length === 0 && !tipsLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-full shadow-sm mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No recommendations yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-2 mb-6">
                  We need a bit more data to personalize your feed. Try searching for products or scanning some receipts!
              </p>
              <Button onClick={() => window.location.reload()} variant="outline">
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