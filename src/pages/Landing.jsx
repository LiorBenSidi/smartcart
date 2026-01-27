import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { ArrowRight, ScanLine, LogIn, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import Onboarding from '@/components/Onboarding';

export default function Landing() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasProfile, setHasProfile] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const auth = await base44.auth.isAuthenticated();
        setIsAuthenticated(auth);
        if (auth) {
            const userData = await base44.auth.me();
            setUser(userData);
            
            // Check if user has a profile (new user check)
            const profiles = await base44.entities.UserProfile.filter({ created_by: userData.email });
            setHasProfile(profiles.length > 0);
            
            // If no profile, show onboarding
            if (profiles.length === 0) {
              setShowOnboarding(true);
            }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setHasProfile(true);
    window.location.href = createPageUrl('Main');
  };

  const handleAuth = () => {
    // Redirect to Landing after login so we can check for onboarding
    base44.auth.redirectToLogin(createPageUrl('Landing'));
  };

  const handleNavigation = () => {
    window.location.href = createPageUrl('Main');
  };

  // Show onboarding for new users
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto w-full">
        
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mb-10 relative">
          <div className="absolute inset-0 w-24 h-24 bg-indigo-500/30 rounded-full blur-2xl mx-auto"></div>
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 relative z-10 mx-auto">
            <ScanLine className="w-10 h-10 text-white/90" />
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl font-bold text-white mb-4 tracking-tight leading-tight">
          Your Personal <br />
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Grocery Assistant</span>
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="text-gray-400 text-base mb-12 leading-relaxed max-w-sm">
          I'll help you track spending, find better prices, and make smarter shopping decisions — effortlessly.
        </motion.p>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="w-full space-y-5">

          {!isLoading && (
            <>
              {isAuthenticated ? (
                <div className="w-full space-y-5">
                  {user && (
                    <div className="bg-gradient-to-r from-indigo-950/50 to-purple-950/50 text-indigo-200 px-5 py-4 rounded-2xl text-sm border border-indigo-800/50 backdrop-blur-sm">
                      <span className="text-indigo-400">Welcome back,</span>{' '}
                      <span className="font-medium text-white">{user.display_name || user.full_name || user.email}</span>
                    </div>
                  )}
                  <Button
                    onClick={() => {
                      // If user has no profile, show onboarding first
                      if (hasProfile === false) {
                        setShowOnboarding(true);
                      } else {
                        handleNavigation();
                      }
                    }}
                    className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 font-medium">
                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    onClick={handleAuth}
                    className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 font-medium">
                    <UserPlus className="mr-2 w-5 h-5" /> Sign Up
                  </Button>
                  <Button
                    onClick={handleAuth}
                    variant="ghost"
                    className="w-full h-12 text-base text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200">
                    <LogIn className="mr-2 w-4 h-4" /> Log In
                  </Button>
                </div>
              )}
            </>
          )}
          
          <div className="pt-8 space-y-1">
            <p className="text-xs text-gray-600">Demo • Powered by Gemini 3 Pro</p>
            <p className="text-xs text-gray-600">Lior Ben Sidi & Yarin Katan</p>
          </div>
        </motion.div>

      </div>
    </div>
  );

}