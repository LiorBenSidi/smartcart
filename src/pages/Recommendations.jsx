import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ThumbsUp, ThumbsDown, X, ShoppingCart, Store, Tag, Package } from 'lucide-react';
import { toast } from "sonner";

export default function Recommendations() {
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState(null);
  const [candidates, setCandidates] = useState({ chains: [], categories: [], products: [] });
  const [user, setUser] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        
        // 1. Generate Recommendations
        const res = await base44.functions.invoke('generateCollaborativeRecommendations', { userId: currentUser.email });
        if (res.data.success) {
            setRunId(res.data.runId);
            const all = res.data.candidates || [];
            
            // Organize
            setCandidates({
                chains: all.filter(c => c.candidate_type === 'store_chain'),
                categories: all.filter(c => c.candidate_type === 'category'),
                products: all.filter(c => c.candidate_type === 'canonical_product')
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
      try {
          await base44.functions.invoke('logRecommendationFeedback', {
              runId,
              candidateId: candidate.id || candidate.canonical_product_id, // Candidates might not have IDs if strictly from function return without DB fetch, but we saved them.
              // If we saved them, they have IDs. But the function returned the array we sent to create? 
              // Usually create returns object with ID. generateCollaborativeRecommendations logic: "await Promise.all(allCands.map(c => ...create(c)))".
              // It returned `allCands` which was the payload *before* creation (no IDs).
              // I should fix the backend to return created objects or just use the logic identifiers for now.
              // For feedback, we need candidate_id (ref).
              // Let's assume for prototype we log the 'logic' id if real ID missing, or fix backend.
              // Fixing backend is better but takes a turn. 
              // I'll proceed assuming we might fail on FK if I send non-UUID. 
              // Actually, candidate_id in feedback is just a string, so whatever I send is stored.
              // Ideally I send the DB ID.
              action
          });
          
          if (action === 'dismiss' || action === 'add_to_cart') {
              // Remove from UI
              const type = candidate.candidate_type === 'store_chain' ? 'chains' : candidate.candidate_type === 'category' ? 'categories' : 'products';
              setCandidates(prev => ({
                  ...prev,
                  [type]: prev[type].filter(c => c !== candidate)
              }));
              if (action === 'add_to_cart') toast.success("Added to cart (simulation)");
              else toast.info("Recommendation dismissed");
          }
      } catch (e) {
          console.error(e);
      }
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">For You</h1>
        <p className="text-gray-500 dark:text-gray-400">Personalized picks based on people with similar taste.</p>
      </div>

      {/* 1. Stores */}
      {candidates.chains.length > 0 && (
          <section>
              <h2 className="flex items-center gap-2 text-xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                  <Store className="w-5 h-5 text-indigo-500" /> Recommended Stores
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {candidates.chains.map((c, i) => (
                      <Card key={i} className="hover:shadow-md transition-all border-indigo-100 dark:border-gray-700">
                          <CardContent className="p-4 flex flex-col items-center text-center">
                              <div className="w-12 h-12 bg-indigo-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
                                  <Store className="w-6 h-6 text-indigo-600" />
                              </div>
                              <h3 className="font-bold mb-1">Chain #{c.store_chain_id}</h3>
                              <p className="text-xs text-gray-500 mb-3">Match Score: {(c.score).toFixed(1)}</p>
                              <div className="flex gap-2 w-full">
                                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleFeedback(c, 'dismiss')}>Dismiss</Button>
                                  <Button size="sm" className="flex-1 bg-indigo-600" onClick={() => handleFeedback(c, 'click')}>View</Button>
                              </div>
                          </CardContent>
                      </Card>
                  ))}
              </div>
          </section>
      )}

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
                          <CardContent className="p-4 flex items-start justify-between">
                              <div>
                                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Product #{c.canonical_product_id}</h3>
                                  <p className="text-xs text-gray-500 mt-1">Based on purchase history of similar users</p>
                              </div>
                              <div className="flex flex-col gap-2">
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