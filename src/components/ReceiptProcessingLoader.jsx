import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Loader2, ShieldCheck } from 'lucide-react';

const STEPS = [
  { id: 'reading', label: 'Reading receipt image' },
  { id: 'extracting', label: 'Extracting items & prices' },
  { id: 'verifying', label: 'Verifying totals' }
];

export default function ReceiptProcessingLoader({ imageUrl }) {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Advance steps visually over time (perception aid only)
  useEffect(() => {
    const timers = [
      setTimeout(() => setCurrentStep(1), 3000),
      setTimeout(() => setCurrentStep(2), 8000)
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const isPdf = imageUrl?.toLowerCase().includes('.pdf');

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        
        {/* Main Loading Indicator - Strong Visual Center */}
        <div className="relative mb-8">
          {/* Outer pulse ring */}
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" style={{ animationDuration: '2s' }} />
          {/* Inner glow */}
          <div className="absolute inset-2 rounded-full bg-indigo-500/10 animate-pulse" style={{ animationDuration: '1.5s' }} />
          {/* Spinner container */}
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Loader2 className="w-10 h-10 text-white animate-spin" style={{ animationDuration: '1.2s' }} />
          </div>
        </div>

        {/* Status Text - Clear and Reassuring */}
        <h2 className="text-xl font-bold text-gray-100 mb-2 text-center">
          Analyzing your receipt
        </h2>
        <p className="text-sm text-gray-400 text-center mb-8 max-w-xs">
          Extracting items, prices, and totals — this usually takes under 30 seconds.
        </p>

        {/* Step Indicator - Visual Progress (UI-only) */}
        <div className="w-full max-w-xs space-y-3 mb-8">
          {STEPS.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            
            return (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-500 ${
                  isCompleted 
                    ? 'bg-green-900/20 border border-green-700/30' 
                    : isCurrent 
                      ? 'bg-indigo-900/30 border border-indigo-600/50' 
                      : 'bg-gray-800/30 border border-gray-700/30'
                }`}
              >
                <div className={`flex-shrink-0 transition-all duration-300 ${
                  isCompleted ? 'text-green-400' : isCurrent ? 'text-indigo-400' : 'text-gray-500'
                }`}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ animationDuration: '1s' }} />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </div>
                <span className={`text-sm font-medium transition-colors duration-300 ${
                  isCompleted 
                    ? 'text-green-300' 
                    : isCurrent 
                      ? 'text-indigo-200' 
                      : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Trust Signal */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-8">
          <ShieldCheck className="w-4 h-4 text-gray-600" />
          <span>Low-confidence data will be flagged for your review.</span>
        </div>

        {/* Receipt Preview - Centered and Clear */}
        {imageUrl && (
          <div className="w-full max-w-xs">
            <div className="rounded-xl overflow-hidden border border-gray-700/50 bg-gray-800/50 shadow-lg">
              {isPdf ? (
                <div className="h-48 flex flex-col items-center justify-center bg-gray-800/80 text-gray-400">
                  <div className="w-12 h-16 border-2 border-gray-600 rounded-sm flex items-center justify-center mb-2">
                    <span className="text-xs font-bold text-gray-500">PDF</span>
                  </div>
                  <p className="text-xs text-gray-500">Document uploaded</p>
                </div>
              ) : (
                <img 
                  src={imageUrl} 
                  alt="Your receipt" 
                  className="w-full h-48 object-cover object-top opacity-80"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}