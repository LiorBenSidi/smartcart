import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Info, TrendingUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function AIInsightsPanel({ insights }) {
    if (!insights) {
        return null;
    }

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case 'positive': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'warning': return <AlertCircle className="w-5 h-5 text-amber-600" />;
            default: return <Info className="w-5 h-5 text-blue-600" />;
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'positive': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
            case 'warning': return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
            default: return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
        }
    };

    const allInsights = [
        insights.spendingInsight,
        insights.budgetInsight,
        insights.categoryInsight,
        insights.behaviorInsight
    ].filter(Boolean);

    return (
        <div className="space-y-4">
            <Card className="border-none shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30">
                <CardContent className="pt-6 space-y-4">
                    {allInsights.slice(0, 3).map((insight, idx) => (
                        <div 
                            key={idx} 
                            className={`p-4 rounded-xl border ${getSeverityColor(insight.severity)}`}
                        >
                            <div className="flex items-start gap-3">
                                {getSeverityIcon(insight.severity)}
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">
                                        {insight.title}
                                    </h4>
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        {insight.message}
                                    </p>
                                    {insight.actionable && (
                                        <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                                            💡 {insight.actionable}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {insights.topRecommendations && insights.topRecommendations.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        Optimization Opportunities
                    </h3>
                    <Card className="border-none shadow-sm">
                        <CardContent className="pt-6 space-y-3">
                            {insights.topRecommendations.map((rec, idx) => (
                                <div key={idx} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <h5 className="font-bold text-gray-900 dark:text-gray-100 mb-1">
                                                {rec.title}
                                            </h5>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                                {rec.description}
                                            </p>
                                        </div>
                                        {rec.potentialSavings > 0 && (
                                            <Badge className="bg-green-600 text-white whitespace-nowrap">
                                                Save ₪{rec.potentialSavings.toFixed(0)}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}