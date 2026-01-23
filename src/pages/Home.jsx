import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight, AlertCircle, Sparkles, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import Onboarding from '../components/Onboarding';
import ReceiptFolderView from '../components/ReceiptFolderView';


export default function Home() {
  const [receipts, setReceipts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const handleDeleteReceipt = async (receiptId) => {
    if (confirm("Are you sure you want to delete this receipt?")) {
        try {
            await base44.entities.Receipt.delete(receiptId);
            setReceipts(receipts.filter(r => r.id !== receiptId));
            // Update insights too if they were derived from this receipt
            setInsights(insights.filter(i => i.receiptId !== receiptId));
        } catch (error) {
            console.error("Failed to delete receipt", error);
            alert("Failed to delete receipt");
        }
    }
  };





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

  // We only want to show the top 5 recent receipts in the list, but we fetched 100 for stats
  const recentReceipts = receipts; // Pass all receipts to the folder view

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
    <div className="space-y-6 animate-in fade-in duration-500 p-1 md:p-0">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Home</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your recent shopping activity</p>
        </div>
      </div>

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

      {/* Recent Receipts */}
      <ReceiptFolderView receipts={recentReceipts} onDelete={handleDeleteReceipt} />
    </div>
  );
}