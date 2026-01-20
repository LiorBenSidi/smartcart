import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, X, MapPin, Users, ShoppingCart, TrendingUp, Filter, Split, Clock } from 'lucide-react';

export default function RecommendationExplainer({ mode = 'general', className = '', triggerVariant = 'ghost' }) {
    const [isOpen, setIsOpen] = useState(false);

    const content = {
        general: {
            title: "How We Recommend Products",
            steps: [
                {
                    icon: Users,
                    title: "Community Intelligence",
                    desc: "We analyze purchase patterns from users with similar taste profiles (diet, kosher level, family size) to find items you might love."
                },
                {
                    icon: MapPin,
                    title: "Local Context",
                    desc: "We boost stores and products available near your current location to ensure convenience."
                },
                {
                    icon: TrendingUp,
                    title: "Smart Ranking",
                    desc: "Items are ranked by a combination of community popularity, personal history, and active promotions."
                }
            ]
        },
        cart: {
            title: "How Alternatives Work",
            steps: [
                {
                    icon: Filter,
                    title: "Strict Filtering",
                    desc: "First, we filter out any products that don't match your strict dietary requirements (Allergies, Kosher, Vegan)."
                },
                {
                    icon: ShoppingCart,
                    title: "Similar Product Matching",
                    desc: "We identify products that serve the same purpose (e.g., different brand of pasta) using our product graph."
                },
                {
                    icon: TrendingUp,
                    title: "Price & Value",
                    desc: "We compare unit prices across available options to highlight savings without compromising quality."
                }
            ]
        },
        smart_cart: {
            title: "Smart Cart Optimization",
            steps: [
                {
                    icon: Split,
                    title: "Basket Optimization",
                    desc: "We calculate the total cost of your cart at different store chains nearby to find the cheapest option."
                },
                {
                    icon: Clock,
                    title: "Predictive Restock",
                    desc: "We analyze your purchase history to predict when you're running low on essentials and suggest them at the right time."
                },
                {
                    icon: MapPin,
                    title: "Route Awareness",
                    desc: "We factor in travel time and potential savings when suggesting a 'Split Cart' strategy across two stores."
                }
            ]
        }
    };

    const current = content[mode] || content.general;

    return (
        <>
            <Button variant={triggerVariant} size="sm" className={`gap-2 ${className}`} onClick={() => setIsOpen(true)}>
                <Info className="w-4 h-4" />
                <span className="hidden sm:inline">How this works</span>
            </Button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <CardHeader className="border-b flex flex-row items-center justify-between bg-indigo-50/50 sticky top-0 bg-white/95 backdrop-blur z-10">
                            <CardTitle className="text-xl text-indigo-900">{current.title}</CardTitle>
                            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            {current.steps.map((step, i) => {
                                const Icon = step.icon;
                                return (
                                    <div key={i} className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <Icon className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900 mb-1">{step.title}</h4>
                                            <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            <div className="bg-gray-50 p-4 rounded-lg text-xs text-gray-500 mt-4 border border-gray-100">
                                <span className="font-semibold text-gray-700">Privacy Note:</span> All processing happens securely. We prioritize your configured preferences (Diet, Kosher) above all other signals.
                            </div>

                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setIsOpen(false)}>
                                Got it
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </>
    );
}