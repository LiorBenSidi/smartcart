import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from 'lucide-react';

export default function SpendingTrendChart({ receipts }) {
    // Group receipts by month for the last 6 months
    const now = new Date();
    const monthlyData = [];
    
    for (let i = 5; i >= 0; i--) {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = targetDate.getMonth();
        const year = targetDate.getFullYear();
        
        const monthReceipts = receipts.filter(r => {
            const d = new Date(r.purchased_at || r.date);
            return d.getMonth() === month && d.getFullYear() === year;
        });
        
        const total = monthReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0);
        
        monthlyData.push({
            month: targetDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            amount: parseFloat(total.toFixed(2)),
            count: monthReceipts.length
        });
    }

    return (
        <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Spending Trend (6 Months)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={monthlyData}>
                        <defs>
                            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                            dataKey="month" 
                            axisLine={false}
                            tickLine={false}
                            tick={{fontSize: 12, fill: '#9ca3af'}}
                        />
                        <YAxis 
                            axisLine={false}
                            tickLine={false}
                            tick={{fontSize: 12, fill: '#9ca3af'}}
                            tickFormatter={(value) => `₪${value}`}
                        />
                        <Tooltip 
                            contentStyle={{
                                borderRadius: '8px',
                                border: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                backgroundColor: '#fff'
                            }}
                            formatter={(value, name) => {
                                if (name === 'amount') return [`₪${value}`, 'Spent'];
                                if (name === 'count') return [value, 'Receipts'];
                                return value;
                            }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="amount" 
                            stroke="#6366f1" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorAmount)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}