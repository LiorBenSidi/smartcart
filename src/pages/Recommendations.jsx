import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import RecommendationExplainer from '@/components/RecommendationExplainer';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package, MapPin, ExternalLink, Info } from 'lucide-react';
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import UserSimilarityDisplay from "@/components/UserSimilarityDisplay";

export default function Recommendations() {
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState(null);
  const [candidates, setCandidates] = useState({ chains: [], categories: [], products: [] });
  const [user, setUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);

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
            setCandidates({
                chains: res.data.candidates.stores || [],
                categories: res.data.candidates.categories || [],
                products: res.data.candidates.items || []
            });
        }
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
      <div className="space-y-2">
        <div className="flex justify-between items-start">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">For You</h1>
            <RecommendationExplainer mode="general" />
        </div>
        <p className="text-gray-500 dark:text-gray-400">Personalized picks based on people with similar taste.</p>
      </div>

      <UserSimilarityDisplay currentUser={user} />

      {/* 1. Stores */}
      {candidates.chains.length > 0 && (
          <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                  <Store className="w-5 h-5 text-indigo-500" /> Recommended Stores
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {candidates.chains.map((c, i) => {
                      const matchQuality = getMatchQuality(c.score);
                      return (
                          <Card key={i} className="hover:shadow-md transition-all border-indigo-100 dark:border-gray-700 relative overflow-hidden group">
                              <div className={`absolute top-0 left-0 w-1 h-full ${matchQuality.color}`} />
                              {i === 0 && (
                                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold z-10">
                                      Top Pick
                                  </div>
                              )}
                              <CardContent className="p-4 flex flex-col items-center text-center">
                                  <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full shadow-sm flex items-center justify-center mb-3 overflow-hidden border border-gray-100 p-2">
                                      {c.image_url ? 
                                          <img src={c.image_url} alt={c.name} className="w-full h-full object-contain" /> :
                                          <Store className="w-8 h-8 text-indigo-600" />
                                      }
                                  </div>
                                  <h3 className="font-bold text-lg mb-1">{c.name || `Chain #${c.store_chain_id}`}</h3>
                                  
                                  <div className="flex items-center gap-1.5 mb-2">
                                      <div className={`w-2 h-2 rounded-full ${matchQuality.color}`} />
                                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                          {Math.round(c.score * 100)}% Match
                                      </span>
                                  </div>

                                  <p className="text-xs text-gray-500 mb-4 line-clamp-2 min-h-[2.5em]">
                                      {c.description || "Recommended based on your shopping preferences and location."}
                                  </p>

                                  <div className="flex gap-2 w-full mt-auto">
                                      <Button variant="outline" size="sm" className="flex-1" onClick={() => handleFeedback(c, 'dismiss')}>
                                          Dismiss
                                      </Button>
                                      <Button size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => handleFeedback(c, 'click')}>
                                          View Details
                                      </Button>
                                  </div>
                              </CardContent>
                          </Card>
                      );
                  })}
              </div>
          </section>
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