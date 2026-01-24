import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Info, TrendingUp, ChevronRight, Sparkles, Check } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function AIInsightsPanel({ insights, focusMode = false }) {
    const [selectedRec, setSelectedRec] = useState(null);
    
    if (!insights) {
        return null;
    }

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case 'positive': return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'warning': return <AlertCircle className="w-4 h-4 text-amber-400" />;
            default: return <Info className="w-4 h-4 text-blue-400" />;
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'positive': return 'bg-green-900/20 border-green-800/50';
            case 'warning': return 'bg-amber-900/20 border-amber-800/50';
            default: return 'bg-blue-900/20 border-blue-800/50';
        }
    };

    const getCategoryEmoji = (title, description) => {
        const text = `${title} ${description}`.toLowerCase();
        if (text.includes('snack') || text.includes('chips') || text.includes('candy') || text.includes('chocolate')) return '🍿';
        if (text.includes('delivery') || text.includes('shipping')) return '🚴';
        if (text.includes('drink') || text.includes('beverage') || text.includes('soda') || text.includes('juice')) return '🥤';
        if (text.includes('meat') || text.includes('chicken') || text.includes('beef')) return '🥩';
        if (text.includes('dairy') || text.includes('milk') || text.includes('cheese') || text.includes('yogurt')) return '🧀';
        if (text.includes('bread') || text.includes('bakery') || text.includes('pastry')) return '🍞';
        if (text.includes('fruit') || text.includes('apple') || text.includes('banana')) return '🍎';
        if (text.includes('vegetable') || text.includes('veggies') || text.includes('salad')) return '🥬';
        if (text.includes('frozen') || text.includes('ice cream')) return '🧊';
        if (text.includes('coffee') || text.includes('tea')) return '☕';
        if (text.includes('cleaning') || text.includes('detergent') || text.includes('soap')) return '🧹';
        if (text.includes('baby') || text.includes('diaper')) return '👶';
        if (text.includes('pet') || text.includes('dog') || text.includes('cat')) return '🐾';
        if (text.includes('organic') || text.includes('health')) return '🌿';
        if (text.includes('store') || text.includes('shop') || text.includes('chain')) return '🏪';
        if (text.includes('brand') || text.includes('switch')) return '🔄';
        if (text.includes('bulk') || text.includes('quantity')) return '📦';
        if (text.includes('save') || text.includes('money') || text.includes('budget')) return '💰';
        return '💡';
    };

    const allInsights = [
        insights.spendingInsight,
        insights.budgetInsight,
        insights.categoryInsight,
        insights.behaviorInsight
    ].filter(Boolean);

    // Calculate total potential savings from recommendations
    const totalSavings = useMemo(() => {
        if (!insights.topRecommendations) return 0;
        return insights.topRecommendations.reduce((sum, rec) => sum + (rec.potentialSavings || 0), 0);
    }, [insights.topRecommendations]);

    const recommendationsCount = insights.topRecommendations?.length || 0;
    const displayedRecs = focusMode ? insights.topRecommendations?.slice(0, 3) : insights.topRecommendations?.slice(0, 3);

    // Focus Mode UI
    if (focusMode) {
        return (
            <div className="space-y-5">
                {/* Hero Savings Card - Glassmorphism */}
                {totalSavings > 0 && (
                    <div className="relative overflow-hidden rounded-2xl">
                        {/* Glass background */}
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-green-600/15 to-teal-600/20 backdrop-blur-xl" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        {/* Subtle glow effect */}
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500/20 rounded-full blur-3xl" />
                        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl" />
                        
                        <div className="relative p-6 border border-green-500/20 rounded-2xl">
                            <div className="text-center">
                                <p className="text-emerald-300/80 text-xs font-medium uppercase tracking-widest mb-2">
                                    Potential Monthly Savings
                                </p>
                                <h2 className="text-5xl md:text-6xl font-bold text-white tracking-tight mb-1">
                                    ₪{totalSavings.toFixed(0)}
                                </h2>
                                <p className="text-emerald-400/70 text-sm">
                                    {recommendationsCount} action{recommendationsCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Focused Action List */}
                {insights.topRecommendations && insights.topRecommendations.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium px-1">
                            Highest Impact Actions
                        </p>
                        
                        <div className="space-y-2">
                            {displayedRecs.map((rec, idx) => (
                                <Dialog key={idx}>
                                    <DialogTrigger asChild>
                                        <div className="group relative overflow-hidden rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.01]">
                                            {/* Glass card background */}
                                            <div className="absolute inset-0 bg-gray-800/40 backdrop-blur-sm border border-gray-700/50 rounded-xl group-hover:bg-gray-800/60 group-hover:border-gray-600/50 transition-colors" />
                                            
                                            <div className="relative p-4 flex items-center gap-4">
                                                {/* Icon */}
                                                <span className="text-2xl shrink-0">{getCategoryEmoji(rec.title, rec.description)}</span>
                                                
                                                {/* Content - Single line */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-gray-100 text-sm font-medium truncate">
                                                        {rec.title}
                                                    </p>
                                                </div>
                                                
                                                {/* Savings + Chevron */}
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {rec.potentialSavings > 0 && (
                                                        <span className="text-emerald-400 font-bold text-sm whitespace-nowrap">
                                                            Save ₪{rec.potentialSavings.toFixed(0)}
                                                        </span>
                                                    )}
                                                    <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
                                                </div>
                                            </div>
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-md bg-gray-900/95 backdrop-blur-xl border-gray-700/50">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-3 text-gray-100">
                                                <span className="text-2xl">{getCategoryEmoji(rec.title, rec.description)}</span>
                                                {rec.title}
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4">
                                            <p className="text-sm text-gray-400 leading-relaxed">{rec.description}</p>
                                            {rec.potentialSavings > 0 && (
                                                <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-4 text-center">
                                                    <p className="text-emerald-400 font-bold text-lg">
                                                        ₪{rec.potentialSavings.toFixed(0)}/month
                                                    </p>
                                                    <p className="text-emerald-500/70 text-xs mt-1">potential savings</p>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1 h-10">
                                                    Add to plan
                                                </Button>
                                                <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 flex-1 h-10">
                                                    Remind me
                                                </Button>
                                            </div>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            ))}
                        </div>

                        {/* Subtle progress indicator */}
                        {recommendationsCount > 0 && (
                            <div className="flex items-center justify-center gap-2 pt-2">
                                <div className="flex gap-1.5">
                                    {[...Array(Math.min(recommendationsCount, 3))].map((_, i) => (
                                        <div 
                                            key={i} 
                                            className="w-1.5 h-1.5 rounded-full bg-gray-600"
                                        />
                                    ))}
                                </div>
                                <span className="text-[10px] text-gray-600 font-medium">
                                    0 of {Math.min(recommendationsCount, 3)} completed
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Non-Focus Mode UI (original)
    return (
        <div className="space-y-4">
            {/* Optimization Summary Strip */}
            {totalSavings > 0 && (
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-700/50 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-green-200 font-medium">
                                Save up to <span className="text-green-400 font-bold">₪{totalSavings.toFixed(0)}</span> this month
                            </p>
                            <p className="text-green-400/70 text-xs">
                                by changing {recommendationsCount} habit{recommendationsCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <span className="text-green-400 text-sm font-medium shrink-0">
                        {recommendationsCount} tips
                    </span>
                </div>
            )}

            {/* Optimization Opportunities - Now First */}
            {insights.topRecommendations && insights.topRecommendations.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-300 uppercase tracking-wider">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        Optimization Opportunities
                    </h3>
                    <div className="space-y-2">
                        {displayedRecs.map((rec, idx) => (
                            <Card key={idx} className="border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 transition-colors overflow-hidden">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-xl shrink-0 mt-0.5">{getCategoryEmoji(rec.title, rec.description)}</span>
                                        <div className="flex-1 min-w-0">
                                            <h5 className="font-semibold text-gray-100 text-sm mb-1">
                                                {rec.title}
                                            </h5>
                                            <p className="text-xs text-gray-400 line-clamp-2">
                                                {rec.description}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {rec.potentialSavings > 0 && (
                                                <span className="text-green-400 font-bold text-sm">
                                                    Save ₪{rec.potentialSavings.toFixed(0)}
                                                </span>
                                            )}
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost"
                                                        className="h-8 px-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-md">
                                                    <DialogHeader>
                                                        <DialogTitle className="flex items-center gap-2">
                                                            <Sparkles className="w-5 h-5 text-green-400" />
                                                            {rec.title}
                                                        </DialogTitle>
                                                    </DialogHeader>
                                                    <div className="space-y-4">
                                                        <p className="text-sm text-gray-300">{rec.description}</p>
                                                        {rec.potentialSavings > 0 && (
                                                            <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
                                                                <p className="text-green-400 font-semibold">
                                                                    Potential savings: ₪{rec.potentialSavings.toFixed(0)}/month
                                                                </p>
                                                            </div>
                                                        )}
                                                        <div className="flex gap-2">
                                                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white flex-1">
                                                                Add to plan
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700 flex-1">
                                                                Remind me
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* AI Insights - Condensed */}
            {allInsights.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-300 uppercase tracking-wider">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        AI Analysis
                    </h3>
                    <div className="space-y-2">
                        {allInsights.slice(0, 3).map((insight, idx) => (
                            <div 
                                key={idx} 
                                className={`p-3 rounded-lg border ${getSeverityColor(insight.severity)}`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 shrink-0">
                                        {getSeverityIcon(insight.severity)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-gray-100 text-sm">
                                            {insight.title}
                                        </h4>
                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                            {insight.message}
                                        </p>
                                        {insight.actionable && (
                                            <p className="mt-2 text-xs text-indigo-400 font-medium">
                                                → {insight.actionable}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}