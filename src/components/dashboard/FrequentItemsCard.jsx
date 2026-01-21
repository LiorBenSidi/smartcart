import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingBag, TrendingUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function FrequentItemsCard({ items = [] }) {
    if (!items || items.length === 0) {
        return (
            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-indigo-600" />
                        Most Purchased Items
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-gray-500">No data available yet</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-600" />
                    Most Purchased Items
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {items.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {item.category && <Badge variant="outline" className="text-[10px] h-5">{item.category}</Badge>}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-bold text-indigo-600 dark:text-indigo-400">{item.count}x</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">₪{item.total?.toFixed(2)}</div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}