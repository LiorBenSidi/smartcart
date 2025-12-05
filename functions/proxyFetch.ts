Deno.serve(async (req) => {
  try {
    const url = new URL(req.url).searchParams.get("url");

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing ?url= parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const method = req.method;
    const headers = {};
    req.headers.forEach((v, k) => { if (k !== "host") headers[k] = v; });

    let body = null;
    if (method !== "GET" && method !== "HEAD") {
      body = await req.arrayBuffer();
    }

    const out = await fetch(url, { method, headers, body });

    const responseBody = new Uint8Array(await out.arrayBuffer());
    const proxyHeaders = new Headers();
    out.headers.forEach((v, k) => proxyHeaders.set(k, v));

    return new Response(responseBody, {
      status: out.status,
      headers: proxyHeaders
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});