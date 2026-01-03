import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, User, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function StoreReviews({ storeId, storeName, onClose }) {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [hoverRating, setHoverRating] = useState(0);

    const fetchReviews = async () => {
        try {
            const data = await base44.entities.StoreReview.filter({ store_id: storeId }, '-created_date', 50);
            setReviews(data);
        } catch (error) {
            console.error("Failed to load reviews", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (storeId) fetchReviews();
    }, [storeId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rating === 0) return;

        setSubmitting(true);
        try {
            const res = await base44.functions.invoke('submitStoreReview', {
                store_id: storeId,
                rating,
                comment
            });

            if (res.data.success) {
                setRating(0);
                setComment('');
                fetchReviews();
            }
        } catch (error) {
            console.error("Failed to submit review", error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-3">Write a Review for {storeName}</h3>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                className="focus:outline-none transition-transform hover:scale-110"
                            >
                                <Star 
                                    className={`w-8 h-8 ${
                                        (hoverRating || rating) >= star 
                                            ? 'fill-yellow-400 text-yellow-400' 
                                            : 'text-gray-300'
                                    }`} 
                                />
                            </button>
                        ))}
                        <span className="ml-2 text-sm text-gray-500 font-medium">
                            {rating > 0 ? ['Terrible', 'Bad', 'Okay', 'Good', 'Excellent'][rating - 1] : 'Select rating'}
                        </span>
                    </div>
                    
                    <Textarea 
                        placeholder="Share your experience (optional)..." 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="bg-white"
                        rows={3}
                    />
                    
                    <Button 
                        onClick={handleSubmit} 
                        disabled={rating === 0 || submitting}
                        className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto self-end"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                        Submit Review
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    Recent Reviews 
                    <span className="text-sm font-normal text-gray-500">({reviews.length})</span>
                </h3>
                
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    </div>
                ) : reviews.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p>No reviews yet. Be the first to review!</p>
                    </div>
                ) : (
                    <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2">
                        {reviews.map((review) => (
                            <div key={review.id} className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-xs">
                                            {review.user_display_name?.[0]?.toUpperCase() || <User className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-gray-900">{review.user_display_name || 'Anonymous'}</div>
                                            <div className="text-xs text-gray-500">{format(new Date(review.created_date), 'PPP')}</div>
                                        </div>
                                    </div>
                                    <div className="flex text-yellow-400">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-gray-200'}`} />
                                        ))}
                                    </div>
                                </div>
                                {review.comment && (
                                    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{review.comment}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}