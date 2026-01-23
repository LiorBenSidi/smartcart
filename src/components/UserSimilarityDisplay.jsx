import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Shield, User, Sparkles, TrendingUp, Lightbulb } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function UserSimilarityDisplay({ currentUser, learningSnippet }) {
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
        <Card className="border-indigo-100 dark:border-indigo-900 bg-gradient-to-br from-white to-indigo-50/30 dark:from-gray-800 dark:to-indigo-900/20 mb-6">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                        <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">Shopper Twins</CardTitle>
                        <CardDescription>People with similar taste profiles</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {edges.map((edge, idx) => {
                    const similarity = Math.round(edge.similarity * 100);
                    const displayName = getDisplayName(edge.neighbor_user_id);
                    const explanation = getExplanation(edge.similarity, edge.neighbor_user_id);
                    
                    return (
                        <div 
                            key={edge.id || idx} 
                            className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                        >
                            <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 text-sm font-medium">
                                    {displayName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                        {displayName}
                                    </span>
                                    <Badge 
                                        variant="secondary" 
                                        className={`text-xs ${
                                            similarity >= 80 
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' 
                                                : similarity >= 60 
                                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {similarity}% match
                                    </Badge>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    {explanation}
                                </p>
                            </div>
                            <div className="w-16">
                                <Progress value={similarity} className="h-1.5" />
                            </div>
                        </div>
                    );
                })}
                
                {learningSnippet && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                        <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                                {learningSnippet}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}