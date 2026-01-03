import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Admin check
        let isAdmin = user?.role === 'admin';
        if (!isAdmin && user) {
             const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
             if (profiles?.[0]?.is_admin) isAdmin = true;
        }

        if (!isAdmin) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { startDate, endDate, role } = await req.json().catch(() => ({}));

        // Fetch Data
        // Using service role to ensure we get all data
        const allUsers = await base44.asServiceRole.entities.User.list(); 
        // Fetching up to 2000 receipts for analytics - in production, this should use specific aggregation queries if available
        const allReceipts = await base44.asServiceRole.entities.Receipt.filter({}, '-created_date', 2000); 

        // Filter Users
        let filteredUsers = allUsers;
        if (role && role !== 'all') {
            filteredUsers = allUsers.filter(u => u.role === role);
        }
        const userEmails = new Set(filteredUsers.map(u => u.email));

        // Filter Receipts
        let filteredReceipts = allReceipts.filter(r => userEmails.has(r.created_by));
        
        const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1)); // Default last month
        const end = endDate ? new Date(endDate) : new Date();

        filteredReceipts = filteredReceipts.filter(r => {
            const d = new Date(r.created_date);
            return d >= start && d <= end;
        });

        // Aggregate Data
        const dailyStats = {};
        
        // Initialize days in range
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            dailyStats[dateStr] = { 
                date: dateStr, 
                spending: 0, 
                receiptsCount: 0, 
                processingTimeSum: 0, 
                processedCount: 0 
            };
        }

        filteredReceipts.forEach(r => {
            const date = r.created_date.split('T')[0];
            if (dailyStats[date]) {
                dailyStats[date].spending += (r.total_amount || 0);
                dailyStats[date].receiptsCount += 1;
                
                if (r.processing_status === 'processed') {
                    const created = new Date(r.created_date);
                    const updated = new Date(r.updated_date);
                    const diffSeconds = (updated - created) / 1000;
                    // Simple heuristic to filter out manual updates much later
                    if (diffSeconds > 0 && diffSeconds < 3600) { 
                         dailyStats[date].processingTimeSum += diffSeconds;
                         dailyStats[date].processedCount += 1;
                    }
                }
            }
        });

        const timeline = Object.values(dailyStats).sort((a,b) => a.date.localeCompare(b.date));
        timeline.forEach(t => {
            t.avgProcessingTime = t.processedCount ? Math.round(t.processingTimeSum / t.processedCount) : 0;
            t.spending = Number(t.spending.toFixed(2));
        });

        // Calculate Summary
        const activeUserEmails = new Set(filteredReceipts.map(r => r.created_by));
        
        return Response.json({
            timeline,
            summary: {
                totalSpending: filteredReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0),
                totalReceipts: filteredReceipts.length,
                activeUsers: activeUserEmails.size,
                totalUsers: filteredUsers.length,
                avgProcessingTime: timeline.reduce((sum, t) => sum + t.avgProcessingTime, 0) / (timeline.filter(t => t.avgProcessingTime > 0).length || 1)
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});