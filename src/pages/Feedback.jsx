import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MessageSquarePlus, Send, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from "sonner";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Feedback() {
    const [type, setType] = useState('suggestion');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) return;

        setLoading(true);
        try {
            const user = await base44.auth.me();
            if (!user) {
                toast.error("Please log in to send feedback");
                return;
            }

            await base44.entities.AppFeedback.create({
                user_id: user.email,
                type,
                message,
                status: 'new'
            });

            setSuccess(true);
            toast.success("Feedback sent successfully!");
            setMessage('');
        } catch (error) {
            console.error("Error sending feedback", error);
            toast.error("Failed to send feedback");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6 animate-in fade-in">
            <Link 
                to={createPageUrl('Profile')} 
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Profile
            </Link>
            
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Send Feedback</h1>
                <p className="text-gray-500 dark:text-gray-400">
                    Help us improve your experience. We read every message!
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquarePlus className="w-5 h-5 text-indigo-600" />
                        Share your thoughts
                    </CardTitle>
                    <CardDescription>
                        Found a bug? Have a feature request? Let us know.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {success ? (
                        <div className="text-center py-8 space-y-4">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100">Thanks for your feedback!</h3>
                                <p className="text-gray-500 dark:text-gray-400 mt-1">Your input helps us build a better app.</p>
                            </div>
                            <Button variant="outline" onClick={() => setSuccess(false)} className="mt-4">
                                Send Another
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Feedback Type</Label>
                                <Select value={type} onValueChange={setType}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="suggestion">Suggestion / Feature Request</SelectItem>
                                        <SelectItem value="bug">Report a Bug</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Message</Label>
                                <Textarea 
                                    placeholder="Tell us what's on your mind..."
                                    className="min-h-[150px] resize-none"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="pt-2">
                                <Button type="submit" disabled={loading || !message.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700">
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4 mr-2" />
                                    )}
                                    Send Feedback
                                </Button>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}