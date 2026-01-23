import React, { useState, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Info, TrendingUp, ChevronRight, Sparkles } from 'lucide-react';
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
                    <Badge className="bg-green-600 text-white shrink-0">
                        {recommendationsCount} tips
                    </Badge>
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
                                                <Badge className="bg-green-600 text-white font-bold">
                                                    Save ₪{rec.potentialSavings.toFixed(0)}
                                                </Badge>
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
            {!focusMode && allInsights.length > 0 && (
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