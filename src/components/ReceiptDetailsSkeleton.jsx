import React from 'react';
import { CheckCircle2, Loader2, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Shimmer animation component
const Shimmer = ({ className }) => (
  <div className={`animate-pulse bg-gradient-to-r from-gray-700/40 via-gray-600/40 to-gray-700/40 bg-[length:200%_100%] rounded ${className}`} 
       style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
);

export default function ReceiptDetailsSkeleton({ showSavedBadge = true }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeOutBadge {
          0%, 80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Success Confirmation Banner */}
      {showSavedBadge && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-emerald-300">Receipt saved</p>
            <p className="text-emerald-400/70 text-sm flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading details…
            </p>
          </div>
        </div>
      )}

      {/* Header with disabled buttons */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link to={createPageUrl('Upload')}>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Receipt Details</h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Loading</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
                  <RefreshCw className="w-4 h-4 mr-2" /> Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Available once details finish loading</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Available once details finish loading</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Status Copy */}
      <div className="text-center py-2">
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Preparing items and totals for display.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">Usually under 5 seconds.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Receipt Card Skeleton */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-6">
              {/* Header Skeleton */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Shimmer className="w-12 h-12 rounded-xl" />
                  <div className="space-y-2">
                    <Shimmer className="h-5 w-32 rounded" />
                    <Shimmer className="h-3 w-20 rounded" />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <Shimmer className="h-7 w-24 rounded ml-auto" />
                  <Shimmer className="h-5 w-14 rounded-full ml-auto" />
                </div>
              </div>

              {/* Items Table Skeleton */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <Shimmer className="h-3 w-28 rounded" />
                  <Shimmer className="h-3 w-16 rounded" />
                </div>
                
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2 px-2">
                  <div className="col-span-5">ITEM</div>
                  <div className="col-span-2 text-center">QTY</div>
                  <div className="col-span-2 text-right">PAID</div>
                  <div className="col-span-3 text-right">BENCHMARK</div>
                </div>

                {/* Skeleton Rows - 10 items */}
                <div className="space-y-1">
                  {[...Array(10)].map((_, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg">
                      <div className="col-span-5 space-y-1.5">
                        <Shimmer className="h-4 w-full max-w-[180px] rounded" />
                        <Shimmer className="h-2 w-24 rounded" />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <Shimmer className="h-3 w-6 rounded" />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Shimmer className="h-4 w-14 rounded" />
                      </div>
                      <div className="col-span-3 flex justify-end">
                        <Shimmer className="h-3 w-12 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Insights Sidebar Skeleton */}
        <div className="lg:col-span-1 space-y-6">
          {/* Financial Insights Skeleton */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 border-b border-gray-100 dark:border-gray-700">
              <Shimmer className="h-3 w-32 rounded" />
            </div>
            <div className="p-4 space-y-3">
              {[...Array(2)].map((_, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-start gap-3">
                    <Shimmer className="w-5 h-5 rounded flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Shimmer className="h-4 w-full rounded" />
                      <Shimmer className="h-3 w-3/4 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What-if Simulator Skeleton */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 p-4 border-b border-violet-100 dark:border-violet-800">
              <Shimmer className="h-3 w-28 rounded" />
            </div>
            <div className="p-4 space-y-3">
              <Shimmer className="h-8 w-full rounded" />
              {[...Array(2)].map((_, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start gap-3">
                    <Shimmer className="w-5 h-5 rounded flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Shimmer className="h-4 w-full rounded" />
                      <Shimmer className="h-3 w-full rounded" />
                      <Shimmer className="h-3 w-1/2 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}