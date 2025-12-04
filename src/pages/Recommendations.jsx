import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, TrendingDown, Leaf, ShoppingCart } from 'lucide-react';

export default function Recommendations() {
  const [filter, setFilter] = useState('all');

  const recommendations = [
    {
        id: 1,
        type: 'saving',
        title: 'Switch Supermarket',
        description: 'You could save ~15% by shopping at "Budget Mart" for your Produce items.',
        savings: '$12.50/mo',
        icon: TrendingDown,
        color: 'text-green-600',
        bg: 'bg-green-100'
    },
    {
        id: 2,
        type: 'health',
        title: 'Healthier Alternative',
        description: 'Swap "Sugar Smacks" for "Oat Crunch". Less sugar, more fiber.',
        savings: 'Better Health',
        icon: Leaf,
        color: 'text-emerald-600',
        bg: 'bg-emerald-100'
    },
    {
        id: 3,
        type: 'brand',
        title: 'Brand Switch',
        description: 'Switching to store-brand milk saves $1.20 per gallon.',
        savings: '$4.80/mo',
        icon: ShoppingCart,
        color: 'text-blue-600',
        bg: 'bg-blue-100'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-indigo-500" fill="currentColor" fillOpacity={0.2} />
          Insights
        </h2>
        <p className="text-gray-500 text-sm">AI-powered suggestions for you.</p>
      </div>

      {/* Mock Categories/Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['all', 'savings', 'health'].map(f => (
            <button 
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    filter === f 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
            >
                {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
        ))}
      </div>

      <div className="space-y-4">
        {recommendations.map(rec => (
            <Card key={rec.id} className="border-none shadow-sm hover:shadow-md transition-all duration-300">
                <CardContent className="p-5 flex gap-4">
                    <div className={`w-12 h-12 rounded-xl ${rec.bg} ${rec.color} flex items-center justify-center flex-shrink-0`}>
                        <rec.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-gray-900 text-sm">{rec.title}</h3>
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{rec.savings}</span>
                        </div>
                        <p className="text-sm text-gray-500 leading-relaxed">{rec.description}</p>
                        <Button variant="link" className="h-auto p-0 text-indigo-600 text-xs font-semibold mt-2">
                            View Details
                        </Button>
                    </div>
                </CardContent>
            </Card>
        ))}
      </div>
    </div>
  );
}