import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Database, Trash2, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SystemValidationPanel from '../components/SystemValidationPanel';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [productCount, setProductCount] = useState(0);
  const [storeCount, setStoreCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  const fetchAdminData = async () => {
      try {
          const user = await base44.auth.me();
          
          // Check admin status via UserProfile
          let isAdmin = user.role === 'admin';
          if (!isAdmin) {
              const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
              isAdmin = profiles.length > 0 && profiles[0].is_admin;
          }

          if (!isAdmin) {
              window.location.href = '/'; // Redirect if not admin
              return;
          }

          // Fetch real data
          const allReceipts = await base44.entities.Receipt.list();
          setReceipts(allReceipts);

          const allProducts = await base44.entities.Product.list();
          setProductCount(allProducts.length);

          const allStores = await base44.entities.Store.list();
          setStoreCount(allStores.length);

          // Fetch real users (admin only operation)
          const allUsers = await base44.entities.User.list();
          
          // Calculate stats
          const usersWithStats = allUsers.map(u => ({
              ...u,
              receipts: allReceipts.filter(r => r.created_by === u.email).length
          }));
          setUsers(usersWithStats);
          
          // Initial Analytics Fetch
          fetchAnalytics();

      } catch (e) {
          console.error("Admin access denied or error", e);
          setIsLoading(false);
      } finally {
          setIsLoading(false);
      }
  };

  const fetchAnalytics = async () => {
    setIsAnalyticsLoading(true);
    try {
        const response = await base44.functions.invoke('getAdminAnalytics', {
            startDate: dateRange.start,
            endDate: dateRange.end,
            role: roleFilter
        });
        setAnalyticsData(response.data);
    } catch (e) {
        console.error("Failed to load analytics", e);
    } finally {
        setIsAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    if (!isLoading) {
        fetchAnalytics();
    }
  }, [dateRange, roleFilter]);

  const handleDeleteAllReceipts = async () => {
    setIsDeleting(true);
    try {
      await base44.entities.Receipt.filter({}, '', 1000).then(async (allReceipts) => {
        for (const receipt of allReceipts) {
          await base44.entities.Receipt.delete(receipt.id);
        }
      });
      setReceipts([]);
      setShowConfirm(false);
      
      // Update user stats
      const updatedUsers = users.map(u => ({ ...u, receipts: 0 }));
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Failed to delete receipts', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setIsDeleting(true);
    try {
      // Delete in order to respect dependencies
      const allReceipts = await base44.entities.Receipt.list();
      for (const r of allReceipts) await base44.entities.Receipt.delete(r.id);
      
      const receiptItems = await base44.entities.ReceiptItem.list();
      for (const r of receiptItems) await base44.entities.ReceiptItem.delete(r.id);
      
      const receiptInsights = await base44.entities.ReceiptInsight.list();
      for (const r of receiptInsights) await base44.entities.ReceiptInsight.delete(r.id);
      
      const savedCarts = await base44.entities.SavedCart.list();
      for (const r of savedCarts) await base44.entities.SavedCart.delete(r.id);
      
      const productPrices = await base44.entities.ProductPrice.list();
      for (const r of productPrices) await base44.entities.ProductPrice.delete(r.id);
      
      const products = await base44.entities.Product.list();
      for (const r of products) await base44.entities.Product.delete(r.id);
      
      const promotions = await base44.entities.Promotion.list();
      for (const r of promotions) await base44.entities.Promotion.delete(r.id);
      
      const stores = await base44.entities.Store.list();
      for (const r of stores) await base44.entities.Store.delete(r.id);
      
      const chains = await base44.entities.Chain.list();
      for (const r of chains) await base44.entities.Chain.delete(r.id);
      
      setReceipts([]);
      setShowConfirm(false);
      
      const updatedUsers = users.map(u => ({ ...u, receipts: 0 }));
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Failed to delete all data', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center">Loading Admin Panel...</div>;

  return (
    <div className="space-y-6">
        <div className="bg-slate-800 dark:bg-slate-900 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    Admin Console
                </h1>
                <p className="text-slate-300 text-sm mt-1">Analytics & System Management</p>
            </div>
            <div className="flex gap-2">
                <Link to={createPageUrl('CatalogAdmin')}>
                    <Button className="bg-white/10 hover:bg-white/20 text-white border-0">
                        <Database className="w-4 h-4 mr-2" /> Catalog
                    </Button>
                </Link>
            </div>
        </div>

        <Tabs defaultValue="analytics" className="w-full">
            <TabsList className="bg-white dark:bg-gray-800 p-1 mb-4 rounded-xl border border-gray-100 dark:border-gray-700 w-full justify-start">
                <TabsTrigger value="analytics" className="rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-indigo-900/30 dark:data-[state=active]:text-indigo-400">Dashboard</TabsTrigger>
                <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-indigo-900/30 dark:data-[state=active]:text-indigo-400">Users & Receipts</TabsTrigger>
                <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-indigo-900/30 dark:data-[state=active]:text-indigo-400">System Health</TabsTrigger>
            </TabsList>

            <TabsContent value="analytics" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                {/* Analytics Controls */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500">Date Range:</span>
                        <Input 
                            type="date" 
                            value={dateRange.start}
                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                            className="w-auto h-9"
                        />
                        <span className="text-gray-300">-</span>
                        <Input 
                            type="date" 
                            value={dateRange.end}
                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                            className="w-auto h-9"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-500">User Role:</span>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-32 h-9">
                                <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Active Users</p>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {analyticsData?.summary?.activeUsers || 0}
                                <span className="text-sm text-gray-400 font-normal ml-1">/ {analyticsData?.summary?.totalUsers || 0}</span>
                            </h3>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Total Spending</p>
                            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                ₪{(analyticsData?.summary?.totalSpending || 0).toLocaleString()}
                            </h3>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Receipts</p>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {analyticsData?.summary?.totalReceipts || 0}
                            </h3>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Avg Process Time</p>
                            <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                {analyticsData?.summary?.avgProcessingTime ? Math.round(analyticsData.summary.avgProcessingTime) : 0}s
                            </h3>
                        </CardContent>
                    </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800 p-4">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">Spending Trends</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analyticsData?.timeline || []}>
                                    <defs>
                                        <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#9ca3af" tickFormatter={(v) => format(new Date(v), 'MM/dd')} />
                                    <YAxis tick={{fontSize: 12}} stroke="#9ca3af" />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        formatter={(value) => [`₪${value}`, 'Spending']}
                                        labelFormatter={(l) => format(new Date(l), 'MMM d, yyyy')}
                                    />
                                    <Area type="monotone" dataKey="spending" stroke="#10b981" fillOpacity={1} fill="url(#colorSpending)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800 p-4">
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">Receipt Processing</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analyticsData?.timeline || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" tick={{fontSize: 12}} stroke="#9ca3af" tickFormatter={(v) => format(new Date(v), 'MM/dd')} />
                                    <YAxis yAxisId="left" tick={{fontSize: 12}} stroke="#9ca3af" />
                                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12}} stroke="#9ca3af" unit="s" />
                                    <Tooltip 
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                        labelFormatter={(l) => format(new Date(l), 'MMM d, yyyy')}
                                    />
                                    <Legend />
                                    <Bar yAxisId="left" dataKey="receiptsCount" name="Receipts" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="avgProcessingTime" name="Avg Time (s)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
                {/* Existing User Table & Controls */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Products</p>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{productCount}</h3>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm bg-white dark:bg-gray-800">
                        <CardContent className="p-4">
                            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold mb-1">Stores</p>
                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{storeCount}</h3>
                        </CardContent>
                    </Card>
                </div>

                {showConfirm && (
                    <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 mb-6">
                        <CardContent className="p-4 space-y-3">
                            <h3 className="font-bold text-red-900 dark:text-red-300">⚠️ Confirm Deletion</h3>
                            <p className="text-sm text-red-700 dark:text-red-400">
                                Are you sure you want to delete all {receipts.length} receipts? This action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <Button 
                                    variant="outline" 
                                    className="flex-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300" 
                                    onClick={() => setShowConfirm(false)}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600" 
                                    onClick={handleDeleteAllReceipts}
                                    disabled={isDeleting}
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete All'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                        <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200">User Database</h3>
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => setShowConfirm(true)}
                            className="h-8"
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Clear All Receipts
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow className="dark:border-gray-700">
                                <TableHead className="dark:text-gray-400">Email</TableHead>
                                <TableHead className="dark:text-gray-400">Role</TableHead>
                                <TableHead className="text-right dark:text-gray-400">Receipts</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id} className="dark:border-gray-700">
                                    <TableCell className="font-medium text-gray-900 dark:text-gray-200">{user.email}</TableCell>
                                    <TableCell>
                                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                            {user.role}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right text-gray-900 dark:text-gray-300">{user.receipts}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>

            <TabsContent value="system">
                <SystemValidationPanel />
            </TabsContent>
        </Tabs>



        <SystemValidationPanel />

        {showConfirm && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-red-900 dark:text-red-300">⚠️ Confirm Deletion</h3>
                    <p className="text-sm text-red-700 dark:text-red-400">
                        Are you sure you want to delete all {receipts.length} receipts? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            className="flex-1 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300" 
                            onClick={() => setShowConfirm(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600" 
                            onClick={handleDeleteAllReceipts}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete All'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-bold text-sm text-gray-700 dark:text-gray-200">User Database</h3>
            </div>
            <Table>
                <TableHeader>
                    <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-400">Email</TableHead>
                        <TableHead className="dark:text-gray-400">Role</TableHead>
                        <TableHead className="text-right dark:text-gray-400">Receipts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id} className="dark:border-gray-700">
                            <TableCell className="font-medium text-gray-900 dark:text-gray-200">{user.email}</TableCell>
                            <TableCell>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                    {user.role}
                                </span>
                            </TableCell>
                            <TableCell className="text-right text-gray-900 dark:text-gray-300">{user.receipts}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    </div>
  );
}