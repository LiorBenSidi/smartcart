import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import https from "node:https";

Deno.serve(async (req) => {
  console.log("[proxyFetch] Function invoked");

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
      });
  }
  
  try {
    console.log("[proxyFetch] Parsing request body");
    const input = await req.json().catch((e) => {
      console.error("[proxyFetch] Failed to parse JSON:", e.message);
      return {};
    });

    console.log("[proxyFetch] Input received:", JSON.stringify(input));

    const url = input.url;
    const method = input.method || "GET";
    const headers = input.headers || {};
    const body = input.body || null;

    console.log("[proxyFetch] Request details:", { url, method, hasBody: !!body });

    if (!url) {
      console.error("[proxyFetch] URL is missing");
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log("[proxyFetch] Making external fetch to:", url);
    
    // Create agent that accepts self-signed certificates
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    
    // Perform actual external fetch (allowed by Base44)
    const external = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      agent
    });

    console.log("[proxyFetch] External response received:", { 
      status: external.status, 
      statusText: external.statusText,
      headers: Array.from(external.headers.entries()) 
    });

    console.log("[proxyFetch] Reading response buffer");
    const buffer = new Uint8Array(await external.arrayBuffer());
    console.log("[proxyFetch] Buffer size:", buffer.length);

    // Copy external headers to response
    const outputHeaders = {};
    external.headers.forEach((value, key) => {
      outputHeaders[key] = value;
    });

    console.log("[proxyFetch] Returning response with status:", external.status);
    return new Response(buffer, {
      status: external.status,
      headers: outputHeaders
    });

  } catch (err) {
    console.error("[proxyFetch] ERROR:", err.message);
    console.error("[proxyFetch] ERROR stack:", err.stack);
    return new Response(
      JSON.stringify({ error: err.message || String(err), stack: err.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});