import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck } from 'lucide-react';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAdminData = async () => {
        try {
            const user = await base44.auth.me();
            
            // Check admin status via UserProfile
            let isAdmin = user.email === 'liorben@base44.com';
            if (!isAdmin) {
                const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
                isAdmin = profiles.length > 0 && profiles[0].isAdmin;
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