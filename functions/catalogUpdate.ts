import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

// CONFIG:
const LOGIN_URL = "https://url.publishedprices.co.il/login";
const FILE_LIST_URL = "https://url.publishedprices.co.il/file";
const FILE_DOWNLOAD_URL = "https://url.publishedprices.co.il/file/d";

const LOGIN_USERNAME_FIELD = "username";
const LOGIN_PASSWORD_FIELD = "password";

// Helper
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractTimestamp(name) {
  const m = name.match(/(\d{14}|\d{12})/);
  return m ? m[1] : "";
}

function extractCookies(header) {
  if (!header) return "";
  return header
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .join("; ");
}

async function callProxy(base44, url, options = {}) {
  const payload = {
    url,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null
  };

  return await base44.functions.invoke("proxyFetch", payload);
}

// MAIN HANDLER
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // admin check
    let admin = user.email === "liorben@base44.com";
    try {
      if (!admin) {
        const profiles = await base44.entities.UserProfile.filter({
          created_by: user.email
        });
        admin = profiles.length > 0 && !!profiles[0].isAdmin;
      }
    } catch {}

    if (!admin) return jsonResponse({ error: "Admin access required" }, 403);

    let bodyData = {};
    try { bodyData = await req.json(); } catch {}

    const username = bodyData.username;
    const password = bodyData.password || "";
    const pattern = bodyData.filePattern || "PriceFull";

    if (!username) return jsonResponse({ error: "username required" }, 400);

    // -----------------------------------------------------------------------
    // STEP 1: Login via proxyFetch
    // -----------------------------------------------------------------------

    const loginForm = new URLSearchParams();
    loginForm.append(LOGIN_USERNAME_FIELD, username);
    loginForm.append(LOGIN_PASSWORD_FIELD, password);

    const loginResp = await callProxy(base44, LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginForm.toString()
    });

    const setCookie = loginResp.headers.get("set-cookie");
    const cookieHeader = extractCookies(setCookie);

    if (!cookieHeader) {
      return jsonResponse({ error: "Login failed (no cookies)" }, 401);
    }

    // -----------------------------------------------------------------------
    // STEP 2: Fetch file listing
    // -----------------------------------------------------------------------

    const listResp = await callProxy(base44, FILE_LIST_URL, {
      headers: { Cookie: cookieHeader }
    });

    const html = await listResp.text();

    const gzFiles = new Set();
    const re = />([^<]+\.gz)</g;
    let match;

    while ((match = re.exec(html)) !== null) {
      gzFiles.add(match[1].trim());
    }

    const available = Array.from(gzFiles).filter((x) => x.includes(pattern));

    if (available.length === 0) {
      return jsonResponse({ error: "No matching gz files found" }, 404);
    }

    available.sort((a, b) => extractTimestamp(b).localeCompare(extractTimestamp(a)));
    const fileName = available[0];

    // -----------------------------------------------------------------------
    // STEP 3: Download file via proxy
    // -----------------------------------------------------------------------

    const downloadUrl = `${FILE_DOWNLOAD_URL}?fname=${encodeURIComponent(fileName)}`;
    const downloadResp = await callProxy(base44, downloadUrl, {
      headers: { Cookie: cookieHeader }
    });

    const compressedData = new Uint8Array(await downloadResp.arrayBuffer());

    // -----------------------------------------------------------------------
    // STEP 4: Decompress
    // -----------------------------------------------------------------------

    let xmlString;
    try {
      xmlString = new TextDecoder().decode(gunzipSync(compressedData));
    } catch (err) {
      return jsonResponse({ error: "Failed to decompress file" }, 500);
    }

    // -----------------------------------------------------------------------
    // STEP 5: XML parse
    // -----------------------------------------------------------------------

    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    let root;
    try {
      root = parser.parse(xmlString).root;
    } catch {
      return jsonResponse({ error: "Invalid XML data" }, 500);
    }

    const chainId = root.ChainId || "";
    const subChainId = root.SubChainId || "";
    const storeId = root.StoreId || "";

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    const svc = base44.asServiceRole;

    // -----------------------------------------------------------------------
    // UPSERT chain + store
    // -----------------------------------------------------------------------

    let chain = (await svc.entities.Chain.filter({ external_chain_id: chainId }))[0];
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: username,
        external_chain_id: chainId
      });
    }

    let store = (await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_id: storeId
    }))[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `${username} - Store ${storeId}`
      });
    }

    // -----------------------------------------------------------------------
    // Load existing product + price mappings
    // -----------------------------------------------------------------------

    const products = await svc.entities.Product.filter({ chain_id: chain.id });
    const prices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map(products.map((p) => [p.external_item_code, p]));
    const priceMap = new Map(prices.map((p) => [p.product_id, p]));

    // -----------------------------------------------------------------------
    // PROCESS items
    // -----------------------------------------------------------------------

    let processed = 0;
    let failed = 0;

    for (const it of items) {
      try {
        const code = it.ItemCode?.toString().trim();
        if (!code) continue;

        const productPayload = {
          chain_id: chain.id,
          external_item_code: code,
          name: it.ItemName || "",
          brand: it.ManufacturerName || "",
          description: it.ManufacturerItemDescription || "",
          unit_of_measure: it.UnitOfMeasure || "",
          unit_qty: it.UnitQty || "",
          qty_in_package: parseNumber(it.QtyInPackage),
          is_weighted: String(it.bIsWeighted || "") === "1",
          item_type: it.ItemType || "",
          status: it.ItemStatus || ""
        };

        let product = productMap.get(code);
        if (!product) {
          product = await svc.entities.Product.create(productPayload);
          productMap.set(code, product);
        } else {
          await svc.entities.Product.update(product.id, productPayload);
        }

        const pricePayload = {
          product_id: product.id,
          store_id: store.id,
          price: parseNumber(it.ItemPrice),
          unit_price: parseNumber(it.UnitOfMeasurePrice),
          allow_discount: String(it.AllowDiscount || "") === "1",
          price_update_at: it.PriceUpdateDate || new Date().toISOString()
        };

        let price = priceMap.get(product.id);
        if (!price) {
          price = await svc.entities.ProductPrice.create(pricePayload);
          priceMap.set(product.id, price);
        } else {
          await svc.entities.ProductPrice.update(price.id, pricePayload);
        }

        processed++;
      } catch (err) {
        failed++;
      }
    }

    // -----------------------------------------------------------------------
    // DONE
    // -----------------------------------------------------------------------

    return jsonResponse({
      success: true,
      fileName,
      chainId,
      storeId,
      totalItems: items.length,
      processed,
      failed
    });

  } catch (err) {
    return jsonResponse({
      error: err.message || String(err)
    }, 500);
  }
});