import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Shield, User, Sparkles, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function UserSimilarityDisplay({ currentUser }) {
    const [edges, setEdges] = useState([]);
    const [loading, setLoading] = useState(true);
    const [neighborDetails, setNeighborDetails] = useState({});
    const [myVector, setMyVector] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            if (!currentUser?.email) return;

            setLoading(true);
            try {
                // 1. Fetch my vector for explanation context
                const vectorSnaps = await base44.entities.UserVectorSnapshot.filter({
                    user_id: currentUser.email,
                    vector_type: 'behavior'
                }, '-computed_at', 1);
                
                const vector = vectorSnaps[0]?.vector_json || {};
                setMyVector(vector);

                // 2. Fetch similar users (edges)
                const similarUsers = await base44.entities.SimilarUserEdge.filter({
                    user_id: currentUser.email
                });
                
                // Sort by similarity descending and take top 5
                const topUsers = similarUsers
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, 5);
                
                setEdges(topUsers);

                // 3. If Admin, fetch neighbor details
                if (currentUser.role === 'admin' && topUsers.length > 0) {
                    const details = {};
                    await Promise.all(topUsers.map(async (edge) => {
                        try {
                            // Try to find user by email (neighbor_user_id)
                            const users = await base44.entities.User.filter({ email: edge.neighbor_user_id });
                            if (users.length > 0) {
                                details[edge.neighbor_user_id] = users[0];
                            }
                        } catch (err) {
                            console.error(`Failed to fetch user ${edge.neighbor_user_id}`, err);
                        }
                    }));
                    setNeighborDetails(details);
                }

            } catch (error) {
                console.error("Failed to load similarity data", error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [currentUser]);

    const getExplanation = (similarity, neighborId) => {
        // Generate a pseudo-explanation based on my own top vector traits
        // Since we assume neighbors are similar, they likely share these traits.
        if (!myVector || Object.keys(myVector).length === 0) {
            return "Based on general shopping behavior";
        }

        // Find top keys in my vector
        const topKeys = Object.entries(myVector)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([key]) => key);

        if (topKeys.length === 0) return "Similar shopping patterns";

        // Humanize keys
        const traits = topKeys.map(k => {
            if (k.startsWith('cat_')) return k.replace('cat_', '');
            if (k.startsWith('chain_')) return 'specific stores';
            if (k.startsWith('diet_')) return 'dietary preferences';
            return 'product choices';
        });

        const uniqueTraits = [...new Set(traits)];
        const mainTrait = uniqueTraits[0];
        
        if (similarity > 0.9) return `Nearly identical taste in ${mainTrait}`;
        if (similarity > 0.8) return `Strong match in ${mainTrait}`;
        return `Similar preferences for ${uniqueTraits.join(' and ')}`;
    };

    const getDisplayName = (neighborId) => {
        if (currentUser.role === 'admin') {
            const user = neighborDetails[neighborId];
            return user?.display_name || user?.full_name || user?.email || neighborId;
        }
        // Generate consistent random code for regular users
        // Simple hash of string to number
        let hash = 0;
        for (let i = 0; i < neighborId.length; i++) {
            hash = ((hash << 5) - hash) + neighborId.charCodeAt(i);
            hash |= 0;
        }
        return `User #${Math.abs(hash).toString().substring(0, 4)}`;
    };

    if (loading) {
        return (
            <Card className="border-indigo-100 dark:border-indigo-900 mb-6">
                <CardContent className="p-6 flex justify-center">
                    <div className="flex items-center gap-2 text-gray-500">
                         <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                         <span>Finding similar shoppers...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (edges.length === 0) {
        return (
             <Card className="border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900/50 mb-6">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Shopper Twins</CardTitle>
                            <CardDescription>People with similar taste profiles</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                        <p>Not enough data yet to find your shopper twins.</p>
                        <p className="mt-1">Keep scanning receipts to build your profile!</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-white to-indigo-50/30 dark:from-gray-800 dark:to-indigo-950/20">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                        <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Shopper Twins</CardTitle>
                        <CardDescription>People with similar taste profiles</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {edges.map((edge, i) => {
                        const score = Math.round(edge.similarity * 100);
                        const name = getDisplayName(edge.neighbor_user_id);
                        const isAdminView = currentUser.role === 'admin';

                        return (
                            <div key={i} className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                                <Avatar className="h-10 w-10 border border-indigo-100">
                                    <AvatarImage src="" />
                                    <AvatarFallback className={`${isAdminView ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                                        {isAdminView ? (name[0] || 'U') : <User className="w-5 h-5" />}
                                    </AvatarFallback>
                                </Avatar>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <h4 className="font-semibold text-sm truncate flex items-center gap-2">
                                            {name}
                                            {isAdminView && <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">Real User</Badge>}
                                        </h4>
                                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{score}% Match</span>
                                    </div>
                                    
                                    <Progress value={score} className="h-1.5 mb-2 bg-gray-100 dark:bg-gray-700" indicatorClassName="bg-gradient-to-r from-indigo-500 to-purple-500" />
                                    
                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                        <Sparkles className="w-3 h-3 text-amber-500" />
                                        {getExplanation(edge.similarity, edge.neighbor_user_id)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}