import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { ShoppingBag } from 'lucide-react';
import Onboarding from '../components/Onboarding';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const auth = await base44.auth.isAuthenticated();
        setIsAuthenticated(auth);
        
        if (auth) {
            const currentUser = await base44.auth.me();
            setUser(currentUser);

            // Check Admin Status
            let adminStatus = currentUser.role === 'admin';
            if (!adminStatus) {
                try {
                    const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
                    if (profiles.length > 0 && profiles[0].is_admin) {
                        adminStatus = true;
                    }
                } catch(e) {
                    console.error("Error checking admin status", e);
                }
            }
            setIsAdmin(adminStatus);

            // Check if Onboarding Needed
            // We'll let Dashboard handle checking if data exists, but we can do a quick check here too
            // Actually, AnalyticsDashboard will trigger onboarding if needed
        }
      } catch (error) {
        console.error("Auth check failed", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

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

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <AnalyticsDashboard 
        user={user} 
        isAdmin={isAdmin} 
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
    />
  );
}