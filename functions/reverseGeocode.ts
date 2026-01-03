import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { lat, lon } = await req.json();

        if (!lat || !lon) {
            return Response.json({ error: "Coordinates required" }, { status: 400 });
        }

        // 1. Nominatim Reverse
        const params = new URLSearchParams({
            lat,
            lon,
            format: 'jsonv2',
            zoom: 18,
            addressdetails: 1
        });

        const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
        
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Base44SmartCart/1.0 (admin@base44.com)'
            }
        });

        if (!res.ok) {
            throw new Error(`Nominatim error: ${res.status}`);
        }

        const data = await res.json();
        
        return Response.json({
            display_name: data.display_name,
            address: data.address
        });

    } catch (error) {
        console.error("Reverse geocoding failed:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});