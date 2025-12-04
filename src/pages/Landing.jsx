import React from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { ArrowRight, ScanLine, TrendingUp, Leaf } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const handleLogin = () => {
    // Navigate to Home to allow the user to trigger login from there if needed
    window.location.href = createPageUrl('Home');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto w-full">
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 relative"
        >
          <div className="w-24 h-24 bg-indigo-600 rounded-3xl rotate-3 absolute -top-2 -left-2 opacity-20 blur-xl"></div>
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 mx-auto rotate-12">
            <ScanLine className="w-10 h-10 text-white" />
          </div>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight"
        >
          Smart Grocery <br/>
          <span className="text-indigo-600">Assistant</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-gray-500 text-lg mb-10 leading-relaxed"
        >
          Scan receipts, track spending, and get AI-powered insights to save money and eat healthier.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-full space-y-4"
        >
          <Button 
            onClick={handleLogin}
            className="w-full h-14 text-lg bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-200 transition-all"
          >
            Get Started
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          
          <p className="text-xs text-gray-400 mt-6">
            Step 1 Prototype • Powered by Gemini Pro 3
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-2 gap-4 w-full">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-left">
                <TrendingUp className="w-6 h-6 text-green-500 mb-2" />
                <h3 className="font-bold text-gray-900">Track Costs</h3>
                <p className="text-xs text-gray-500">Monthly analytics</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-left">
                <Leaf className="w-6 h-6 text-emerald-500 mb-2" />
                <h3 className="font-bold text-gray-900">Eat Better</h3>
                <p className="text-xs text-gray-500">Health insights</p>
            </div>
        </div>
      </div>
    </div>
  );
}