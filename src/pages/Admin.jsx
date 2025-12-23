import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Database, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchAdminData = async () => {
        try {
            const user = await base44.auth.me();
            
            // Check admin status via UserProfile
            let isAdmin = user.email === 'liorben@base44.com';
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

            // Fetch real users (admin only operation)
            const allUsers = await base44.entities.User.list();
            
            // Calculate stats
            const usersWithStats = allUsers.map(u => ({
                ...u,
                receipts: allReceipts.filter(r => r.created_by === u.email).length
            }));
            setUsers(usersWithStats);

        } catch (e) {
            console.error("Admin access denied or error", e);
            setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
    };
    fetchAdminData();
  }, []);

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
        <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                Admin Console
            </h1>
            <p className="text-slate-300 text-sm mt-1">System Overview</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <Card>
                <CardContent className="p-4 text-center">
                    <h3 className="text-3xl font-bold text-indigo-600">{users.length}</h3>
                    <p className="text-xs text-gray-500 uppercase font-bold">Total Users</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4 text-center">
                    <h3 className="text-3xl font-bold text-indigo-600">{receipts.length}</h3>
                    <p className="text-xs text-gray-500 uppercase font-bold">Total Receipts</p>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <Link to={createPageUrl('CatalogAdmin')}>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                    <Database className="w-4 h-4 mr-2" /> Catalog Ingestion
                </Button>
            </Link>
            <Button 
                className="w-full bg-red-600 hover:bg-red-700" 
                onClick={() => setShowConfirm(true)}
                disabled={receipts.length === 0}
            >
                <Trash2 className="w-4 h-4 mr-2" /> Delete All Receipts
            </Button>
        </div>

        <Button 
            className="w-full bg-red-800 hover:bg-red-900" 
            onClick={handleDeleteAllData}
        >
            <Trash2 className="w-4 h-4 mr-2" /> Delete ALL Data (Receipts, Products, Stores, Chains)
        </Button>

        {showConfirm && (
            <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-red-900">⚠️ Confirm Deletion</h3>
                    <p className="text-sm text-red-700">
                        Are you sure you want to delete all {receipts.length} receipts? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            className="flex-1" 
                            onClick={() => setShowConfirm(false)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            className="flex-1 bg-red-600 hover:bg-red-700" 
                            onClick={handleDeleteAllReceipts}
                            disabled={isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete All'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="font-bold text-sm text-gray-700">User Database</h3>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Receipts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {user.role}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">{user.receipts}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    </div>
  );
}