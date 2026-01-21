import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { ArrowRight, ScanLine, TrendingUp, Leaf, LogIn, UserPlus, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const auth = await base44.auth.isAuthenticated();
        setIsAuthenticated(auth);
        if (auth) {
            const userData = await base44.auth.me();
            setUser(userData);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleAuth = () => {
    base44.auth.redirectToLogin(createPageUrl('Home'));
  };

  const handleNavigation = () => {
    window.location.href = createPageUrl('Home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto w-full">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 relative">

          <div className="w-24 h-24 bg-indigo-600 rounded-3xl rotate-3 absolute -top-2 -left-2 opacity-20 blur-xl"></div>
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 mx-auto rotate-12">
            <ScanLine className="w-10 h-10 text-white" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl font-extrabold text-gray-900 dark:text-white mb-4 tracking-tight">

          Smart Grocery <br />
          <span className="text-indigo-600 dark:text-indigo-400">Assistant</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-gray-500 dark:text-gray-400 text-lg mb-10 leading-relaxed">

          Scan receipts, track spending, and get AI-powered insights to save money and eat healthier.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-full space-y-4">

          {!isLoading &&
          <>
              {isAuthenticated ? (
            <div className="w-full space-y-4">
                {user && (
                    <div className="bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200 px-4 py-3 rounded-xl font-medium text-sm border border-indigo-100 dark:border-indigo-800">
                        👋 Hello, {user.display_name || user.full_name || user.email}
                    </div>
                )}
                <Button
                onClick={handleNavigation}
                className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-200 transition-all">

                    Get Started
                    <ArrowRight className="ml-2 w-5 h-5" />
                </Button>


            </div>
            ) :

            <div className="space-y-3">
                   <Button
                onClick={handleAuth}
                className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-200 transition-all">

                    <UserPlus className="mr-2 w-5 h-5" /> Sign Up
                  </Button>
                  <Button
                onClick={handleAuth}
                variant="outline"
                className="w-full h-12 text-base border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950">

                    <LogIn className="mr-2 w-4 h-4" /> Log In
                  </Button>
                </div>
            }
            </>
          }
          
          <p className="text-xs text-gray-400 mt-6">Demo • Powered by Gemini 3 Pro</p>
          <p className="text-xs text-gray-400 mt-6">Lior Ben Sidi & Yarin Katan</p>
        </motion.div>

        <div className="mt-16 grid grid-cols-2 gap-4 w-full">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-left">
                <TrendingUp className="w-6 h-6 text-green-500 mb-2" />
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Track Costs</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Monthly analytics</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-left">
                <Leaf className="w-6 h-6 text-emerald-500 mb-2" />
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Eat Better</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Health insights</p>
            </div>
        </div>
      </div>
    </div>);

}