import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, subDays, parseISO, differenceInSeconds } from 'date-fns';
import { Download, Filter, Calendar, TrendingUp, Clock, Users, Activity, ShoppingBag, Plus, ChevronRight, Loader2, AlertCircle, RefreshCw, Sparkles, TrendingDown, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AnalyticsDashboard({ user, isAdmin, showOnboarding, setShowOnboarding }) {
    const [dateRange, setDateRange] = useState({
        start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [selectedRole, setSelectedRole] = useState('all');
    const [receipts, setReceipts] = useState([]);
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [insights, setInsights] = useState([]);

    // Fetch Data
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Build Filter
                const filter = {};
                // Note: We filter by 'date' (purchase date) for range if possible, or created_date.
                // Using 'date' as it's the dashboard's main timeline.
                if (dateRange.start && dateRange.end) {
                    filter.date = { 
                        $gte: dateRange.start, 
                        $lte: dateRange.end 
                    };
                }

                if (!isAdmin) {
                    filter.created_by = user.email;
                }

                // Fetch Receipts
                // Increasing limit to support analytics
                const data = await base44.entities.Receipt.filter(filter, '-date', 500);
                
                // If Admin, Fetch Users for Role Filtering
                let usersData = [];
                if (isAdmin) {
                    try {
                        usersData = await base44.entities.User.list();
                        // Also fetch UserProfiles for accurate role info if needed, but built-in role is usually enough
                    } catch (e) {
                        console.error("Failed to fetch users", e);
                    }
                }
                setUsers(usersData);

                // Filter by Role in memory if needed (as we can't easily join in filter)
                let filteredData = data;
                if (isAdmin && selectedRole !== 'all') {
                    const allowedEmails = new Set(usersData.filter(u => u.role === selectedRole).map(u => u.email));
                    filteredData = data.filter(r => allowedEmails.has(r.created_by));
                }
                
                setReceipts(filteredData);

                // Process Insights
                const allInsights = filteredData.flatMap(r => {
                    if (!r.insights) return [];
                    return r.insights.map(i => ({ ...i, receiptDate: r.date, store: r.storeName, receiptId: r.id }));
                });
                
                const topInsights = allInsights
                    .filter(i => i.potential_savings > 0 || i.type === 'warning')
                    .sort((a, b) => (b.potential_savings || 0) - (a.potential_savings || 0))
                    .slice(0, 3);
                    
                setInsights(topInsights);

                if (filteredData.length === 0 && !isAdmin && showOnboarding === undefined) {
                    // Trigger onboarding if handled by parent, or here
                }

            } catch (error) {
                console.error("Dashboard fetch failed", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [dateRange, selectedRole, isAdmin, user.email]);

    // Metrics Calculation
    const metrics = useMemo(() => {
        const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const totalReceipts = receipts.length;
        
        // Processing Time (Proxy: updated_date - created_date for processed receipts)
        const processedReceipts = receipts.filter(r => r.processing_status === 'processed' && r.created_date && r.updated_date);
        const avgProcessingTime = processedReceipts.length > 0 
            ? processedReceipts.reduce((sum, r) => sum + differenceInSeconds(new Date(r.updated_date), new Date(r.created_date)), 0) / processedReceipts.length
            : 0;

        return { totalSpent, totalReceipts, avgProcessingTime };
    }, [receipts]);

    // Chart Data Preparation
    const spendingTrendData = useMemo(() => {
        const grouped = receipts.reduce((acc, r) => {
            const date = r.date || format(new Date(), 'yyyy-MM-dd'); // Fallback
            acc[date] = (acc[date] || 0) + (r.totalAmount || 0);
            return acc;
        }, {});
        
        return Object.entries(grouped)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [receipts]);

    const statusData = useMemo(() => {
        const counts = receipts.reduce((acc, r) => {
            const status = r.processing_status || 'unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [receipts]);

    const engagementData = useMemo(() => {
        // Receipts by creation date
        const grouped = receipts.reduce((acc, r) => {
            const date = r.created_date ? format(new Date(r.created_date), 'yyyy-MM-dd') : 'Unknown';
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});

        return Object.entries(grouped)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [receipts]);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const headers = ['Date', 'Store', 'Total Amount', 'Status', 'Created By', 'Created At'];
            const rows = receipts.map(r => [
                r.date,
                `"${r.storeName || ''}"`,
                r.totalAmount || 0,
                r.processing_status,
                r.created_by,
                r.created_date
            ].join(','));
            
            const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `dashboard_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const STATUS_COLORS = {
        'processed': '#10b981',
        'pending': '#6366f1',
        'failed': '#ef4444',
        'unknown': '#9ca3af'
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Dashboard Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        Analytics Dashboard
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Overview for {dateRange.start} to {dateRange.end}
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                        <Calendar className="w-4 h-4 text-gray-500 ml-2" />
                        <input 
                            type="date" 
                            value={dateRange.start}
                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            className="bg-transparent border-none text-xs focus:ring-0 text-gray-700 dark:text-gray-200"
                        />
                        <span className="text-gray-400">-</span>
                        <input 
                            type="date" 
                            value={dateRange.end}
                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            className="bg-transparent border-none text-xs focus:ring-0 text-gray-700 dark:text-gray-200"
                        />
                    </div>

                    {isAdmin && (
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger className="w-[140px] h-9 text-xs">
                                <SelectValue placeholder="Filter Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="admin">Admins</SelectItem>
                                <SelectItem value="user">Users</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleExport}
                        disabled={isExporting}
                        className="h-9 text-xs"
                    >
                        <Download className="w-3 h-3 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Total Spent</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                                ₪{metrics.totalSpent.toFixed(2)}
                            </h3>
                        </div>
                        <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Receipts Scanned</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                                {metrics.totalReceipts}
                            </h3>
                        </div>
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            <ShoppingBag className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-gray-500 uppercase">Avg Process Time</p>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                                {metrics.avgProcessingTime.toFixed(1)}s
                            </h3>
                        </div>
                        <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Spending Trends</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={spendingTrendData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(str) => format(parseISO(str), 'dd/MM')}
                                    tick={{fontSize: 12, fill: '#9CA3AF'}} 
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis 
                                    tick={{fontSize: 12, fill: '#9CA3AF'}} 
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => `₪${val}`}
                                />
                                <Tooltip 
                                    formatter={(val) => `₪${val.toFixed(2)}`}
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}
                                />
                                <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg">Processing Status</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#9ca3af'} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Engagement Chart (Admin or Curiosity) */}
            <Card className="bg-white dark:bg-gray-800 border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="text-lg">Engagement (Receipts Scanned)</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={engagementData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(str) => format(parseISO(str), 'dd/MM')}
                                tick={{fontSize: 12, fill: '#9CA3AF'}} 
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis 
                                tick={{fontSize: 12, fill: '#9CA3AF'}} 
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip />
                            <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Top Insights (Existing Feature) */}
            {insights.length > 0 && (
                <section>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" />
                        Top Savings Opportunities
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {insights.map((insight, idx) => (
                            <Link key={idx} to={`${createPageUrl('Receipt')}?id=${insight.receiptId}`}>
                                <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 h-full flex flex-col">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2 rounded-lg ${
                                            insight.type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                        }`}>
                                            {insight.type === 'warning' ? <AlertCircle className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                        </div>
                                        <span className="text-xs text-gray-400 dark:text-gray-500">{insight.store} • {format(new Date(insight.receiptDate), 'MMM d')}</span>
                                    </div>
                                    <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-1">{insight.message}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 flex-1">{insight.explanation_text}</p>
                                    
                                    <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-700">
                                        {insight.potential_savings > 0 ? (
                                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">
                                                Save ₪{insight.potential_savings.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400">View Details</span>
                                        )}
                                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent Receipts List */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Recent Receipts</h3>
                    <Link to={createPageUrl('upload')} className="text-xs text-indigo-600 font-semibold hover:underline flex items-center">
                        <Plus className="w-3 h-3 mr-1" /> Scan New
                    </Link>
                </div>
                
                <div className="space-y-3">
                    {receipts.slice(0, 5).map((receipt) => {
                        const isPending = receipt.processingStatus === 'pending';
                        const isFailed = receipt.processingStatus === 'failed';

                        return (
                            <Link key={receipt.id} to={`${createPageUrl('Receipt')}?id=${receipt.id}`}>
                                <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border flex items-center justify-between hover:shadow-md transition-all active:scale-[0.99] ${
                                    isPending ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-900/20' : 
                                    isFailed ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/20' : 
                                    'border-gray-100 dark:border-gray-700'
                                }`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                                            isPending ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700' :
                                            isFailed ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-700' :
                                            'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600'
                                        }`}>
                                            {isPending ? (
                                                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                            ) : isFailed ? (
                                                <AlertCircle className="w-5 h-5 text-red-500" />
                                            ) : (
                                                <ShoppingBag className="w-5 h-5 text-gray-500" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                                {isPending ? 'Processing...' : receipt.storeName}
                                            </h4>
                                            <p className={`text-xs ${
                                                isPending ? 'text-indigo-600' :
                                                isFailed ? 'text-red-500' :
                                                'text-gray-500'
                                            }`}>
                                                {isPending ? 'Analyzing receipt...' :
                                                 isFailed ? 'Processing failed' :
                                                 format(new Date(receipt.date), 'MMM d, yyyy')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isPending ? (
                                            <span className="text-xs text-indigo-600 font-medium bg-indigo-100 px-2 py-1 rounded-full">
                                                In Progress
                                            </span>
                                        ) : isFailed ? (
                                            <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-1 rounded-full flex items-center gap-1">
                                                <RefreshCw className="w-3 h-3" /> Retry
                                            </span>
                                        ) : (
                                            <>
                                                <span className="font-bold text-gray-900 dark:text-gray-100">₪{receipt.totalAmount?.toFixed(2)}</span>
                                                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                    {receipts.length === 0 && !isLoading && (
                        <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                           <ShoppingBag className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                           <p className="text-gray-500 dark:text-gray-400 text-sm">No receipts found in this range.</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}