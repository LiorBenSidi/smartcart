import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package, MapPin, ExternalLink, Info, Lightbulb, HelpCircle, Sparkles, Leaf, Search, RotateCcw, RefreshCw } from 'lucide-react';
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

export default function Recommendations() {
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

  const fetchAIInsights = async () => {
    setLoadingAiInsights(true);
    try {
      const response = await base44.functions.invoke('generateDashboardInsights', {});
      if (response.data.success) {
        setAiInsights(response.data.aiInsights);
      }
    } catch (error) {
      console.error("Error fetching AI insights", error);
    } finally {
      setLoadingAiInsights(false);
    }
  };

  const refreshTips = async (currentCandidates = candidates) => {
      setTipsLoading(true);
      try {
          const tipRes = await base44.functions.invoke('generateSmartTips', { recommendations: currentCandidates });
          if (tipRes.data && tipRes.data.tips) {
              setSmartTips(tipRes.data.tips);
              toast.success("Tips refreshed!");
          }
      } catch (e) {
          console.error("Smart tips failed", e);
          toast.error("Failed to refresh tips");
      } finally {
          setTipsLoading(false);
      }
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
      {/* AI Insights Panel */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          AI-Powered Insights
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAIInsights}
          disabled={loadingAiInsights}
          className="gap-2"
        >
          {loadingAiInsights ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>
      
      {loadingAiInsights && (
        <Card className="border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800 mb-8">
          <CardContent className="p-6 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-sm text-gray-700 dark:text-gray-300">AI is analyzing your shopping patterns...</span>
          </CardContent>
        </Card>
      )}

      {aiInsights && !loadingAiInsights && (
        <div className="mb-8">
          <AIInsightsPanel insights={aiInsights} />
        </div>
      )}

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
                                Personalized Recommendations - Technical Details
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 text-sm">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded border border-indigo-100 dark:border-indigo-800">
                                <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> 
                                    New: Smart Tips Engine
                                </h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                                    We now use a Generative AI model to analyze your shopping habits alongside community trends to provide actionable advice:
                                </p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>Money Saving:</strong> Identifies potential savings based on your frequently bought items and active store promotions.</li>
                                    <li><strong>Health & Diet:</strong> Suggests healthier alternatives or complementary items that match your dietary profile (Vegan, Kosher, etc.).</li>
                                    <li><strong>Discovery:</strong> Highlights trending products from categories you love but haven't explored yet.</li>
                                </ul>
                            </div>

                            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">1. Hybrid Recommendation Engine:</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs">Our system combines three distinct signals to rank products:</p>
                                    <ul className="list-disc list-inside ml-4 text-xs">
                                        <li><strong>Collaborative Filtering:</strong> "Shopper Twins" analysis finds users with similar vector profiles (diet, budget, taste) and suggests what they buy.</li>
                                        <li><strong>Content-Based:</strong> Matches products to your explicit preferences (e.g., "Gluten-Free", "Low Budget").</li>
                                        <li><strong>Contextual Context:</strong> Boosts items based on your current location (nearby store inventory) and active time-sensitive promotions.</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">2. Vector Similarity (The Math):</h4>
                                <div className="space-y-2 text-gray-700 dark:text-gray-300">
                                    <p className="text-xs">We represent every user as a multi-dimensional vector:</p>
                                    <div className="bg-white dark:bg-gray-800 p-2 rounded text-xs font-mono mt-1 border border-gray-100 dark:border-gray-700">
                                        <code className="text-gray-700 dark:text-gray-300">
                                            User_Vector = [Diet_Score, Price_Sensitivity, Brand_Affinity, ...Category_Weights]
                                        </code>
                                    </div>
                                    <p className="text-xs mt-1">
                                        We calculate <strong>Cosine Similarity</strong> between your vector and thousands of others to find your nearest neighbors in taste space.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
                                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200">3. Continuous Learning:</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Every interaction refines your profile in real-time:</p>
                                <ul className="list-disc list-inside ml-4 text-xs text-gray-700 dark:text-gray-300">
                                    <li><strong>Thumbs Up/Down:</strong> Explicitly adjusts category and brand weights.</li>
                                    <li><strong>Dismissals:</strong> Teaches the model what you <em>don't</em> want, reducing the score of similar items.</li>
                                    <li><strong>Receipt Scans:</strong> The strongest signal—verifies actual purchase behavior to update your "Habit" vectors.</li>
                                </ul>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <RecommendationExplainer mode="general" />
        </div>
        <p className="text-gray-500 dark:text-gray-400">Personalized picks based on people with similar taste.</p>
      </div>

      {/* Smart Tips (AI Generated) */}
      {(smartTips.length > 0 || tipsLoading) && (
          <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-200">
                      <Sparkles className="w-5 h-5 text-indigo-500" /> Smart Tips for You
                  </h2>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => refreshTips()}
                    disabled={tipsLoading}
                    className="text-gray-500 hover:text-indigo-600"
                  >
                      <RotateCcw className={`w-4 h-4 mr-2 ${tipsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                  </Button>
              </div>
              
              {tipsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating personalized tips based on your budget and diet...
                  </div>
              ) : (
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
                                            <span className="inline-block mt-2 text-xs bg-white/80 px-2 py-1 rounded border shadow-sm">
                                                Related: {tip.related_entity_name}
                                            </span>
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

      {/* 2. Categories */}
      {candidates.categories.length > 0 && (
          <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                  <Tag className="w-5 h-5 text-pink-500" /> Categories to Explore
              </h2>
              <div className="flex flex-wrap gap-3">
                  {candidates.categories.map((c, i) => (
                      <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                          <span className="font-medium text-sm">{c.category}</span>
                          <button onClick={() => handleFeedback(c, 'dismiss')} className="text-gray-400 hover:text-red-500">
                              <X className="w-4 h-4" />
                          </button>
                      </div>
                  ))}
              </div>
          </section>
      )}

      {/* 3. Items */}
      {candidates.products.length > 0 && (
          <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                  <Package className="w-5 h-5 text-emerald-500" /> Recommended Items
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {candidates.products.map((c, i) => (
                      <Card key={i} className="group relative overflow-hidden border-gray-100 dark:border-gray-700">
                          <CardContent className="p-4 flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1">
                                  {c.image_url && <img src={c.image_url} alt={c.name} className="w-12 h-12 object-contain rounded bg-white border border-gray-100" />}
                                  <div>
                                      <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-2">{c.name || `Product #${c.canonical_product_id}`}</h3>
                                      <p className="text-xs text-gray-500 mt-1">Based on purchase history of similar users</p>
                                      
                                      <div className="flex gap-2 mt-2">
                                          <button onClick={() => handleFeedback(c, 'thumbs_up')} className="text-gray-400 hover:text-green-600 transition-colors">
                                              <ThumbsUp className="w-4 h-4" />
                                          </button>
                                          <button onClick={() => handleFeedback(c, 'thumbs_down')} className="text-gray-400 hover:text-red-500 transition-colors">
                                              <ThumbsDown className="w-4 h-4" />
                                          </button>
                                          <DataCorrectionDialog 
                                              entityType="product" 
                                              entityId={c.canonical_product_id} 
                                              entityName={c.name}
                                              defaultIssueType="price"
                                          />
                                      </div>
                                  </div>
                              </div>
                              <div className="flex flex-col gap-2 flex-shrink-0">
                                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleFeedback(c, 'add_to_cart')}>
                                      <ShoppingCart className="w-4 h-4 mr-1" /> Add
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-500 h-8" onClick={() => handleFeedback(c, 'dismiss')}>
                                      Dismiss
                                  </Button>
                              </div>
                          </CardContent>
                      </Card>
                  ))}
              </div>
          </section>
      )}
    </div>
  );
}