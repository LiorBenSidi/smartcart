import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, TrendingDown, Leaf, ShoppingCart, Loader2, Store, Heart, RefreshCw, ThumbsUp, ThumbsDown, X, MessageSquarePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Recommendations() {
  const [filter, setFilter] = useState('all');
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    generateRecommendations();
  }, []);

  const generateRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await base44.auth.me();
      
      // Fetch user data
      const [profileData, receiptsData, storesData, feedbackData] = await Promise.all([
        base44.entities.UserProfile.filter({ created_by: user.email }),
        base44.entities.Receipt.filter({ created_by: user.email }, '-created_date', 20),
        base44.entities.Store.list(),
        base44.entities.RecommendationFeedback.filter({ created_by: user.email }, '-created_date', 50)
      ]);

      const profile = profileData[0] || {};
      const receipts = receiptsData || [];

      if (receipts.length === 0) {
        setRecommendations([]);
        setLoading(false);
        return;
      }

      // Prepare data for AI
      const recentItems = receipts
        .flatMap(r => r.items || [])
        .slice(0, 50);

      const topCategories = {};
      recentItems.forEach(item => {
        const cat = item.category || 'Other';
        topCategories[cat] = (topCategories[cat] || 0) + (item.total || 0);
      });

      const categorySummary = Object.entries(topCategories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cat, total]) => `${cat}: ₪${total.toFixed(2)}`)
        .join(', ');

      const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const avgPerReceipt = receipts.length > 0 ? totalSpent / receipts.length : 0;

      const storesSummary = storesData.slice(0, 8).map(s => s.name).join(', ');

      // Summarize negative feedback to avoid repeating bad suggestions
      const negativeFeedback = feedbackData
        .filter(f => ['disliked', 'dismissed'].includes(f.action_taken))
        .map(f => `- Avoid "${f.recommendation_title}": ${f.reason_code || 'User disliked'}`)
        .join('\n');

      const prompt = `Generate 3-5 personalized shopping recommendations for this user:
${negativeFeedback ? `\nIMPORTANT - USER FEEDBACK TO RESPECT:\n${negativeFeedback}\n` : ''}

User Profile:
- Budget Focus: ${profile.budget_focus || 'balanced'}
- Household Size: ${profile.household_size || 1}
- Allergens to Avoid: ${profile.allergen_avoid_list?.join(', ') || 'none'}
- Kosher Level: ${profile.kashrut_level || 'none'}
- Age Range: ${profile.age_range || 'not specified'}
- Role: ${profile.user_role || 'not specified'}

Shopping History:
- Total Receipts: ${receipts.length}
- Total Spent: ₪${totalSpent.toFixed(2)}
- Average per Receipt: ₪${avgPerReceipt.toFixed(2)}
- Top Categories: ${categorySummary}
- Recent Stores: ${receipts.slice(0, 3).map(r => r.storeName).join(', ')}

Available Stores in Area: ${storesSummary}

Generate recommendations in the following categories:
1. Savings opportunities (store switches, cheaper alternatives)
2. Health improvements (healthier product swaps based on their purchases)
3. Budget optimization (bulk buying, seasonal items)

Return as JSON array with: type (savings/health/info), title, description, savings (amount or "Better Health"), icon (one of: savings, health, store, info)`;

      const aiResult = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  savings: { type: 'string' },
                  icon: { type: 'string' }
                }
              }
            }
          }
        }
      });

      const recs = aiResult.recommendations.map((rec, idx) => {
        let iconComponent = TrendingDown;
        if (rec.icon === 'health') iconComponent = Heart;
        else if (rec.icon === 'store') iconComponent = Store;
        else if (rec.icon === 'info') iconComponent = Sparkles;

        return {
        ...rec,
        id: idx + 1,
        color: rec.type === 'savings' ? 'text-green-600 dark:text-green-300' : rec.type === 'health' ? 'text-emerald-600 dark:text-emerald-300' : 'text-blue-600 dark:text-blue-300',
        bg: rec.type === 'savings' ? 'bg-green-100 dark:bg-green-900/20' : rec.type === 'health' ? 'bg-emerald-100 dark:bg-emerald-900/20' : 'bg-blue-100 dark:bg-blue-900/20',
        icon: iconComponent
        };
      });

      setRecommendations(recs);
    } catch (err) {
      console.error('Failed to generate recommendations', err);
      setError('Failed to generate recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Feedback State
  const [feedbackDialog, setFeedbackDialog] = useState({ open: false, rec: null, action: null });
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const openFeedback = (rec, action) => {
    if (action === 'liked') {
      // Immediate save for likes
      submitFeedback(rec, action, null, null);
    } else {
      // Open dialog for negative/dismiss
      setFeedbackDialog({ open: true, rec, action });
      setFeedbackReason('');
      setFeedbackComment('');
    }
  };

  const submitFeedback = async (rec, action, reason, comment) => {
    setSubmittingFeedback(true);
    try {
        await base44.entities.RecommendationFeedback.create({
            recommendation_title: rec.title,
            recommendation_description: rec.description,
            recommendation_type: rec.type,
            action_taken: action,
            reason_code: reason || null,
            user_comment: comment || null
        });

        // Remove from view if dismissed or disliked
        if (action !== 'liked') {
            setRecommendations(prev => prev.filter(r => r.id !== rec.id));
            setFeedbackDialog({ open: false, rec: null, action: null });
        } else {
             // Maybe show a "Thanks" toast?
             alert("Thanks for your feedback!");
        }
    } catch (e) {
        console.error("Feedback failed", e);
        alert("Failed to submit feedback");
    } finally {
        setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Generating personalized recommendations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={generateRecommendations} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="text-center py-20">
        <Sparkles className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Recommendations Yet</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Scan some receipts to get personalized insights!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-500 dark:text-indigo-400" fill="currentColor" fillOpacity={0.2} />
            Insights
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">AI-powered suggestions based on your shopping.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={generateRecommendations}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'savings', 'health'].map(f => (
            <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    filter === f 
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' 
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
                {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
        ))}
      </div>

      <div className="space-y-4">
        {recommendations
            .filter(rec => {
                if (filter === 'all') return true;
                return rec.type === filter;
            })
            .map(rec => (
            <Card key={rec.id} className="border-none shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-gray-800">
                <CardContent className="p-5 flex gap-4">
                    <div className={`w-12 h-12 rounded-xl ${rec.bg} ${rec.color} flex items-center justify-center flex-shrink-0`}>
                        <rec.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">{rec.title}</h3>
                            <span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">{rec.savings}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{rec.description}</p>
                        
                        {/* Feedback Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-green-50 hover:text-green-600" onClick={() => openFeedback(rec, 'liked')}>
                                <ThumbsUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-full hover:bg-red-50 hover:text-red-600" onClick={() => openFeedback(rec, 'disliked')}>
                                <ThumbsDown className="w-3.5 h-3.5" />
                            </Button>
                            <div className="flex-1"></div>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] text-gray-400 hover:text-gray-600" onClick={() => openFeedback(rec, 'dismissed')}>
                                Dismiss
                            </Button>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 absolute top-2 right-2 text-gray-300 hover:text-gray-500" onClick={() => openFeedback(rec, 'dismissed')}>
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </CardContent>
            </Card>
        ))}
      </div>

      <Dialog open={feedbackDialog.open} onOpenChange={(open) => !open && setFeedbackDialog({ ...feedbackDialog, open: false })}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Help us improve</DialogTitle>
                <DialogDescription>
                    Why was this recommendation not helpful?
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select value={feedbackReason} onValueChange={setFeedbackReason}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="not_relevant">Not Relevant to Me</SelectItem>
                            <SelectItem value="already_know">I Already Know This</SelectItem>
                            <SelectItem value="incorrect_info">Information is Incorrect</SelectItem>
                            <SelectItem value="too_expensive">Too Expensive</SelectItem>
                            <SelectItem value="preference_mismatch">Doesn't Match My Preferences</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>Comment (Optional)</Label>
                    <Textarea 
                        placeholder="Tell us more..." 
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setFeedbackDialog({ ...feedbackDialog, open: false })}>Cancel</Button>
                <Button 
                    onClick={() => submitFeedback(feedbackDialog.rec, feedbackDialog.action, feedbackReason, feedbackComment)}
                    disabled={submittingFeedback || !feedbackReason}
                >
                    {submittingFeedback ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Feedback"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}