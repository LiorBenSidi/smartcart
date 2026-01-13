import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from "sonner";

export default function DataCorrectionDialog({ entityType, entityId, entityName, trigger, defaultIssueType = 'other' }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [issueType, setIssueType] = useState(defaultIssueType);
    const [description, setDescription] = useState('');
    const [suggestedValue, setSuggestedValue] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const user = await base44.auth.me();
            if (!user) {
                toast.error("Please log in to submit reports");
                return;
            }

            await base44.entities.DataCorrection.create({
                user_id: user.email,
                entity_type: entityType,
                entity_id: entityId,
                entity_name: entityName,
                issue_type: issueType,
                description,
                suggested_value: suggestedValue,
                status: 'pending'
            });

            setSuccess(true);
            setTimeout(() => {
                setOpen(false);
                setSuccess(false);
                setDescription('');
                setSuggestedValue('');
            }, 2000);
            toast.success("Report submitted successfully");
        } catch (error) {
            console.error("Failed to submit report", error);
            toast.error("Failed to submit report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-red-500">
                        <Flag className="w-3 h-3 mr-1" /> Report Issue
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Report Data Issue</DialogTitle>
                    <DialogDescription>
                        Help us improve data for <strong>{entityName || 'this item'}</strong>.
                    </DialogDescription>
                </DialogHeader>

                {success ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-2 text-green-600">
                        <CheckCircle2 className="w-12 h-12" />
                        <p className="font-medium">Thank you for your report!</p>
                        <p className="text-sm text-muted-foreground">We'll review it shortly.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Issue Type</Label>
                            <Select value={issueType} onValueChange={setIssueType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="price">Incorrect Price</SelectItem>
                                    <SelectItem value="stock">Out of Stock</SelectItem>
                                    <SelectItem value="hours">Incorrect Hours</SelectItem>
                                    <SelectItem value="location">Wrong Location</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea 
                                placeholder="Describe the issue..." 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                required
                                className="resize-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Correct Value (Optional)</Label>
                            <Input 
                                placeholder={issueType === 'price' ? 'e.g. 15.90' : 'e.g. Correct details'}
                                value={suggestedValue}
                                onChange={(e) => setSuggestedValue(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={loading || !description} className="bg-red-600 hover:bg-red-700 text-white">
                                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Flag className="w-4 h-4 mr-2" />}
                                Submit Report
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}