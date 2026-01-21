import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, X, MapPin, Users, ShoppingCart, TrendingUp, Filter, Split, Clock, Sparkles, ShieldCheck, Target } from 'lucide-react';

export default function RecommendationExplainer({ mode = 'general', className = '', triggerVariant = 'ghost' }) {
    const [isOpen, setIsOpen] = useState(false);

    const content = {
        general: {
            title: "How We Recommend Products",
            steps: [
                {
                    icon: Sparkles,
                    title: "Smart Tips Engine",
                    desc: "Our AI generates personalized tips by analyzing your complete profile (allergies, kosher level, diet, budget) alongside shopping habits and community trends. All suggestions strictly comply with your allergen avoidances and dietary restrictions—no generic recommendations."
                },
                {
                    icon: ShieldCheck,
                    title: "Strict Preference Adherence",
                    desc: "Every tip rigorously respects your allergen_avoid_list, kosher_level, dietary_restrictions, and health_preferences. We reference specific products with actual prices and compliance confirmations—never vague suggestions."
                },
                {
                    icon: Target,
                    title: "Continuous Learning",
                    desc: "Your thumbs up/down feedback on tips is logged and used to refine future recommendations. The AI learns what you like and avoids styles or topics you've dismissed."
                },
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
            title: "Daily Suggestions - Technical Details",
            steps: [
                {
                    icon: Clock,
                    title: "Weekly Patterns (Predictive)",
                    desc: "Suggests items you frequently purchase on specific days of the week, ensuring you never run out of your routine groceries."
                },
                {
                    icon: TrendingUp,
                    title: "Restock Reminders (Habit-based)",
                    desc: "Identifies products based on your past purchase cadence, suggesting a restock when you're likely running low."
                },
                {
                    icon: Users,
                    title: "Collaborative Filtering (Community Favorites)",
                    desc: "Recommends products popular among users with similar dietary preferences, health goals, and shopping habits."
                },
                {
                    icon: Split,
                    title: "Hybrid Recommendations (Blended Insights)",
                    desc: "Combines your personal purchase history with community trends to offer a balanced and relevant set of suggestions."
                },
                {
                    icon: ShoppingCart,
                    title: "Weekly + Restock (Optimized Habits)",
                    desc: "The most confident suggestions, combining both your consistent weekly purchases and predicting when an item is due for a restock."
                },
                {
                    icon: Sparkles,
                    title: "Smart Tip Feedback Learning",
                    desc: "Your liked and disliked tips influence suggestions—products from liked tips get a confidence boost (+15%), while those from disliked tips are penalized (-20%), ensuring recommendations align with your preferences."
                }
            ]
        }
    };

    const current = content[mode] || content.general;

    return (
        <>
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