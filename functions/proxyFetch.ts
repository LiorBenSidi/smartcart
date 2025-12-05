Deno.serve(async (req) => {
  try {
    const input = await req.json().catch(() => ({}));

    const url = input.url;
    const method = input.method || "GET";
    const headers = input.headers || {};
    const body = input.body || null;

    console.log("[proxyFetch] Request:", { url, method, hasBody: !!body });

    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Perform actual external fetch (allowed by Base44)
    const external = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual'
    });

    console.log("[proxyFetch] External response:", { 
      status: external.status, 
      headers: Array.from(external.headers.entries()) 
    });

    const buffer = new Uint8Array(await external.arrayBuffer());
    console.log("[proxyFetch] Buffer size:", buffer.length);

    // Copy external headers to response
    const outputHeaders = {};
    external.headers.forEach((value, key) => {
      outputHeaders[key] = value;
    });

    return new Response(buffer, {
      status: external.status,
      headers: outputHeaders
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});