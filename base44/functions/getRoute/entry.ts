import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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
        // Auth check optional for public routing features, but let's keep it safe
        // const user = await base44.auth.me();

        const { origin, destination, mode = 'driving' } = await req.json();

        if (!origin || !destination) {
            return Response.json({ error: "Origin and destination required" }, { status: 400 });
        }

        const oLat = parseFloat(origin.lat).toFixed(5);
        const oLon = parseFloat(origin.lon).toFixed(5);
        const dLat = parseFloat(destination.lat).toFixed(5);
        const dLon = parseFloat(destination.lon).toFixed(5);

        const routeHash = hashString(`${oLat},${oLon}-${dLat},${dLon}-${mode}`);

        // 1. Check Cache
        const svc = base44.asServiceRole;
        const cached = await svc.entities.RouteCache.filter({ route_hash: routeHash });

        if (cached.length > 0) {
            const entry = cached[0];
            const age = new Date() - new Date(entry.created_at);
            if (age < 24 * 60 * 60 * 1000) { // 24 hours TTL
                return Response.json({
                    distance: entry.distance_meters,
                    duration: entry.duration_seconds,
                    geometry: JSON.parse(entry.geometry_json),
                    cached: true
                });
            }
            await svc.entities.RouteCache.delete(entry.id);
        }

        // 2. Call OSRM
        // profile: 'driving' -> car, 'walking' -> foot
        const profile = mode === 'walking' ? 'foot' : 'car';
        const coordinates = `${oLon},${oLat};${dLon},${dLat}`;
        const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`;

        const res = await fetch(url);
        if (!res.ok) {
            // Fallback to straight line or just error?
            // Let's throw to trigger catch, or return partial info
            throw new Error(`OSRM error: ${res.status}`);
        }

        const data = await res.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            
            // 3. Cache Result
            await svc.entities.RouteCache.create({
                route_hash: routeHash,
                mode,
                distance_meters: route.distance,
                duration_seconds: route.duration,
                geometry_json: JSON.stringify(route.geometry),
                created_at: new Date().toISOString()
            });

            return Response.json({
                distance: route.distance,
                duration: route.duration,
                geometry: route.geometry,
                cached: false
            });
        }

        return Response.json({ error: "No route found" }, { status: 404 });

    } catch (error) {
        console.error("Routing failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});