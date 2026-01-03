import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { store_id, rating, comment } = await req.json();

    if (!store_id || !rating) {
      return Response.json({ error: 'Store ID and rating are required' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return Response.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Create the review
    const review = await base44.entities.StoreReview.create({
      store_id,
      rating,
      comment,
      user_display_name: user.full_name || user.email.split('@')[0]
    });

    // Use service role to update store aggregations (since regular users can't update stores)
    const svc = base44.asServiceRole;

    // Fetch all reviews for this store to recalculate average
    const reviews = await base44.entities.StoreReview.filter({ store_id });
    
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const average_rating = Number((totalRating / reviews.length).toFixed(1));
    const review_count = reviews.length;

    // Update the store entity
    await svc.entities.Store.update(store_id, {
      average_rating,
      review_count
    });

    return Response.json({ 
      success: true, 
      review,
      storeStats: { average_rating, review_count }
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});