import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// Simple hash function for cache keys
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me(); // Allow public? Assuming auth required for app context

        const { query, country_code } = await req.json();

        if (!query) {
            return Response.json({ error: "Query required" }, { status: 400 });
        }

        const queryStr = (query + (country_code ? ` ${country_code}` : "")).trim().toLowerCase();
        const queryHash = hashString(queryStr);

        // 1. Check Cache
        // Using service role for cache access to allow all users to benefit
        const svc = base44.asServiceRole;
        const cached = await svc.entities.GeocodeCache.filter({ query_hash: queryHash });
        
        // Check validity (30 days)
        if (cached.length > 0) {
            const entry = cached[0];
            const age = new Date() - new Date(entry.created_at);
            if (age < 30 * 24 * 60 * 60 * 1000) {
                return Response.json({
                    lat: entry.lat,
                    lon: entry.lon,
                    display_name: entry.display_name,
                    cached: true
                });
            }
            // Expired, delete (async cleanup ideally, but here just ignore/overwrite)
            await svc.entities.GeocodeCache.delete(entry.id);
        }

        // 2. Call Nominatim
        const params = new URLSearchParams({
            q: query,
            format: 'jsonv2',
            limit: 1,
            addressdetails: 1
        });
        if (country_code) params.append('countrycodes', country_code);

        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        
        // Throttle? In a real high-traffic app we might need a queue. 
        // For now, relies on user-driven traffic which is low.
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Base44SmartCart/1.0 (admin@base44.com)'
            }
        });

        if (!res.ok) {
            throw new Error(`Nominatim error: ${res.status}`);
        }

        const data = await res.json();

        if (data && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            const displayName = result.display_name;

            // 3. Cache Result
            await svc.entities.GeocodeCache.create({
                query_hash: queryHash,
                query_text: queryStr.substring(0, 255), // truncate if needed
                lat,
                lon,
                display_name: displayName,
                created_at: new Date().toISOString()
            });

            return Response.json({
                lat,
                lon,
                display_name: displayName,
                cached: false
            });
        }

        return Response.json({ error: "Location not found" }, { status: 404 });

    } catch (error) {
        console.error("Geocoding failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});