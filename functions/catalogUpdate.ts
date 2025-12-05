import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

// CONFIG:
const LOGIN_URL = "https://url.publishedprices.co.il/login";
const FILE_LIST_URL = "https://url.publishedprices.co.il/file";
const FILE_DOWNLOAD_URL = "https://url.publishedprices.co.il/file/d";

const LOGIN_USERNAME_FIELD = "username";
const LOGIN_PASSWORD_FIELD = "password";

// !!! CHANGE THIS to your actual deployed proxyFetch URL:
const PROXY_URL = "https://69330b1ba1b4842cb79a70d6.functions.base44.com/proxyFetch";

// Helper: Proxy wrapper
async function proxyFetch(url, options = {}) {
  const encoded = `${PROXY_URL}?url=${encodeURIComponent(url)}`;
  return await fetch(encoded, options);
}

// Helpers
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = value
    .toString()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.\-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function buildCookieHeader(header) {
  if (!header) return "";
  return header
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .join("; ");
}

function extractTimestamp(filename) {
  const m = filename.match(/(\d{14}|\d{12})/);
  return m ? m[1] : "";
}

// MAIN HANDLER
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    // Check admin
    let isAdmin = user.email === "liorben@base44.com";
    try {
      if (!isAdmin) {
        const profiles = await base44.entities.UserProfile.filter({
          created_by: user.email
        });
        isAdmin = profiles.length > 0 && !!profiles[0].isAdmin;
      }
    } catch {}

    if (!isAdmin) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    // Parse request body
    let body = {};
    try { body = await req.json(); } catch {}

    const username = body.username;
    const password = body.password || "";
    const filePattern = body.filePattern || "PriceFull";

    if (!username) return jsonResponse({ error: "username is required" }, 400);

    // STEP 1 — LOGIN via proxy
    const form = new URLSearchParams();
    form.append(LOGIN_USERNAME_FIELD, username);
    form.append(LOGIN_PASSWORD_FIELD, password);

    const loginResp = await proxyFetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const setCookie = loginResp.headers.get("set-cookie");
    const cookieHeader = buildCookieHeader(setCookie);

    if (!cookieHeader) {
      return jsonResponse({ error: "Login failed: no cookies" }, 401);
    }

    // STEP 2 — FETCH FILE LIST via proxy
    const listResp = await proxyFetch(FILE_LIST_URL, {
      headers: { Cookie: cookieHeader }
    });

    const html = await listResp.text();

    // Extract .gz filenames
    const files = new Set();
    const regex = />([^<]+\.gz)</g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      files.add(m[1].trim());
    }

    const fileList = Array.from(files).filter((f) => f.includes(filePattern));
    if (fileList.length === 0) {
      return jsonResponse({ error: "No matching .gz files found" }, 404);
    }

    fileList.sort((a, b) => extractTimestamp(b).localeCompare(extractTimestamp(a)));

    const fileName = fileList[0];

    // STEP 3 — DOWNLOAD FILE via proxy
    const dlUrl = `${FILE_DOWNLOAD_URL}?fname=${encodeURIComponent(fileName)}`;
    const dlResp = await proxyFetch(dlUrl, {
      headers: { Cookie: cookieHeader }
    });

    const compressed = new Uint8Array(await dlResp.arrayBuffer());

    // STEP 4 — DECOMPRESS
    let xmlString;
    try {
      xmlString = new TextDecoder().decode(gunzipSync(compressed));
    } catch (err) {
      return jsonResponse({ error: "Decompression failed" }, 500);
    }

    // STEP 5 — PARSE XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    let root;
    try {
      root = parser.parse(xmlString).root;
    } catch {
      return jsonResponse({ error: "Invalid XML format" }, 500);
    }

    const chainId = root.ChainId || "";
    const subChainId = root.SubChainId || "";
    const storeId = root.StoreId || "";

    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    const svc = base44.asServiceRole;

    // UPSERT CHAIN + STORE
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

    // PRELOAD products + prices
    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productMap = new Map(existingProducts.map(p => [p.external_item_code, p]));
    const priceMap = new Map(existingPrices.map(pr => [pr.product_id, pr]));

    // PROCESS ITEMS
    let processed = 0;
    let failed = 0;

    for (const raw of items) {
      try {
        const code = raw.ItemCode?.toString().trim();
        if (!code) continue;

        const productPayload = {
          chain_id: chain.id,
          external_item_code: code,
          name: raw.ItemName || "",
          brand: raw.ManufacturerName || "",
          description: raw.ManufacturerItemDescription || "",
          unit_of_measure: raw.UnitOfMeasure || "",
          unit_qty: raw.UnitQty || "",
          qty_in_package: parseNumber(raw.QtyInPackage),
          is_weighted: String(raw.bIsWeighted || "") === "1",
          item_type: raw.ItemType || "",
          status: raw.ItemStatus || ""
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
          price: parseNumber(raw.ItemPrice),
          unit_price: parseNumber(raw.UnitOfMeasurePrice),
          allow_discount: String(raw.AllowDiscount || "") === "1",
          price_update_at: raw.PriceUpdateDate || new Date().toISOString()
        };

        let priceRec = priceMap.get(product.id);
        if (!priceRec) {
          priceRec = await svc.entities.ProductPrice.create(pricePayload);
          priceMap.set(product.id, priceRec);
        } else {
          await svc.entities.ProductPrice.update(priceRec.id, pricePayload);
        }

        processed++;
      } catch (err) {
        failed++;
      }
    }

    return jsonResponse({
      success: true,
      file: fileName,
      chainId,
      storeId,
      processed,
      failed,
      total: items.length
    });

  } catch (err) {
    return jsonResponse(
      { error: err.message || String(err) },
      500
    );
  }
});
