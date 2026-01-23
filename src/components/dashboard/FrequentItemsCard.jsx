import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function FrequentItemsCard({ items = [] }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div>
            <Button
                variant="outline"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full justify-between"
            >
                <span className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Most Purchased Items
                    {items.length > 0 && <Badge variant="secondary" className="text-xs">{items.length}</Badge>}
                </span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>

            {isOpen && (
                <Card className="border-none shadow-sm mt-2">
                    <CardContent className="space-y-3 pt-4">
                        {(!items || items.length === 0) ? (
                            <p className="text-sm text-gray-500">No data available yet</p>
                        ) : (
                            items.slice(0, 8).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{item.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {item.category && <Badge variant="outline" className="text-[10px] h-5">{item.category}</Badge>}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{Math.round(item.count)}x</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">₪{item.total?.toFixed(2) || '0.00'}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}