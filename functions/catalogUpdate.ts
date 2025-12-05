import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { gunzipSync } from 'npm:fflate@0.8.2';
import { XMLParser } from 'npm:fast-xml-parser@4.5.0';

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

const LOGIN_URL = 'https://url.publishedprices.co.il/login';
const FILE_LIST_URL = 'https://url.publishedprices.co.il/file';
const FILE_DOWNLOAD_URL = 'https://url.publishedprices.co.il/file/d';

const LOGIN_USERNAME_FIELD = 'username';  // change if needed
const LOGIN_PASSWORD_FIELD = 'password';  // change if needed

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function parseNumber(value) {
  if (!value) return 0;
  const cleaned = value
    .toString()
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function buildCookieHeader(setCookieHeader) {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .split(',')
    .map(c => c.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function extractTimestampFromFilename(name) {
  const m = name.match(/(\d{14}|\d{12})/);
  return m ? m[1] : '';
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Admin check
    let isAdmin = user.email === 'liorben@base44.com';
    try {
      if (!isAdmin) {
        const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
        isAdmin = profiles.length > 0 && !!profiles[0].isAdmin;
      }
    } catch {}

    if (!isAdmin) return jsonResponse({ error: 'Admin access required' }, 403);

    // Parse body
    let body = {};
    try { body = await req.json(); } catch {}

    const username = body.username;
    const password = body.password || '';
    const filePattern = body.filePattern || 'PriceFull';

    if (!username) return jsonResponse({ error: 'Username is required' }, 400);

    // -------------------------------------------------------------------------
    // STEP 1: LOGIN
    // -------------------------------------------------------------------------

    const form = new URLSearchParams();
    form.append(LOGIN_USERNAME_FIELD, username);
    form.append(LOGIN_PASSWORD_FIELD, password);

    const loginResp = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      redirect: 'manual'
    });

    if (!loginResp.ok && loginResp.status !== 302) {
      return jsonResponse({ error: 'Login failed' }, 401);
    }

    const setCookie = loginResp.headers.get('set-cookie');
    const cookieHeader = buildCookieHeader(setCookie);
    if (!cookieHeader) return jsonResponse({ error: 'No session cookies received' }, 401);

    // -------------------------------------------------------------------------
    // STEP 2: FETCH FILE LIST (HTML)
    // -------------------------------------------------------------------------

    const listResp = await fetch(FILE_LIST_URL, {
      headers: { Cookie: cookieHeader }
    });

    if (!listResp.ok) return jsonResponse({ error: 'Failed to fetch file list' }, 500);

    const html = await listResp.text();

    // extract all *.gz filenames from HTML
    const gzSet = new Set();
    const regex = />([^<]+\.gz)</g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const name = match[1].trim();
      if (name.toLowerCase().endsWith('.gz')) gzSet.add(name);
    }

    const files = Array.from(gzSet);
    if (files.length === 0) return jsonResponse({ error: 'No .gz files found' }, 404);

    const candidates = files.filter(name => name.includes(filePattern));
    if (candidates.length === 0) {
      return jsonResponse({ error: `No files matching "${filePattern}" found` }, 404);
    }

    candidates.sort((a, b) => {
      const ta = extractTimestampFromFilename(a);
      const tb = extractTimestampFromFilename(b);
      return tb.localeCompare(ta); // descending
    });

    const fileName = candidates[0];

    // -------------------------------------------------------------------------
    // STEP 3: DOWNLOAD FILE
    // -------------------------------------------------------------------------

    const downloadUrl = `${FILE_DOWNLOAD_URL}?fname=${encodeURIComponent(fileName)}`;
    const downloadResp = await fetch(downloadUrl, { headers: { Cookie: cookieHeader } });

    if (!downloadResp.ok) return jsonResponse({ error: 'Failed to download file' }, 500);

    const compressed = new Uint8Array(await downloadResp.arrayBuffer());

    // -------------------------------------------------------------------------
    // STEP 4: DECOMPRESS
    // -------------------------------------------------------------------------

    let xmlString;
    try {
      const decompressed = gunzipSync(compressed);
      xmlString = new TextDecoder().decode(decompressed);
    } catch (e) {
      return jsonResponse({ error: 'Failed to decompress file' }, 500);
    }

    // -------------------------------------------------------------------------
    // STEP 5: PARSE XML SAFELY
    // -------------------------------------------------------------------------

    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false
    });

    let root;
    try {
      root = parser.parse(xmlString).root;
    } catch (e) {
      return jsonResponse({ error: 'Invalid XML format' }, 500);
    }

    const chainId = root.ChainId || '';
    const subChainId = root.SubChainId || '';
    const storeId = root.StoreId || '';

    let itemsXml = root?.Items?.Item || [];
    if (!Array.isArray(itemsXml)) itemsXml = [itemsXml];

    const svc = base44.asServiceRole;

    // -------------------------------------------------------------------------
    // CHAIN + STORE UPSERT
    // -------------------------------------------------------------------------

    let chainList = await svc.entities.Chain.filter({ external_chain_id: chainId });
    let chain = chainList[0];
    if (!chain) {
      chain = await svc.entities.Chain.create({
        name: username,
        external_chain_id: chainId
      });
    }

    let storeList = await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_id: storeId
    });
    let store = storeList[0];
    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `${username} - Store ${storeId}`
      });
    }

    // -------------------------------------------------------------------------
    // PRELOAD EXISTING PRODUCTS + PRICES TO AVOID THOUSANDS OF DB CALLS
    // -------------------------------------------------------------------------

    const existingProducts = await svc.entities.Product.filter({ chain_id: chain.id });
    const existingPrices = await svc.entities.ProductPrice.filter({ store_id: store.id });

    const productByCode = new Map();
    for (const p of existingProducts) {
      productByCode.set(p.external_item_code, p);
    }

    const priceByProductId = new Map();
    for (const pr of existingPrices) {
      priceByProductId.set(pr.product_id, pr);
    }

    // -------------------------------------------------------------------------
    // NORMALIZE AND UPSERT ITEMS
    // -------------------------------------------------------------------------

    let processedCount = 0;
    let errorCount = 0;

    for (const raw of itemsXml) {
      try {
        const itemCode = raw.ItemCode?.toString().trim();
        if (!itemCode) continue;

        const productPayload = {
          chain_id: chain.id,
          external_item_code: itemCode,
          name: raw.ItemName || '',
          brand: raw.ManufacturerName || '',
          description: raw.ManufacturerItemDescription || '',
          unit_of_measure: raw.UnitOfMeasure || '',
          unit_qty: raw.UnitQty || '',
          qty_in_package: parseNumber(raw.QtyInPackage),
          is_weighted: String(raw.bIsWeighted || '') === '1',
          item_type: raw.ItemType || '',
          status: raw.ItemStatus || ''
        };

        let product = productByCode.get(itemCode);
        if (!product) {
          product = await svc.entities.Product.create(productPayload);
          productByCode.set(itemCode, product);
        } else {
          await svc.entities.Product.update(product.id, productPayload);
        }

        const pricePayload = {
          product_id: product.id,
          store_id: store.id,
          price: parseNumber(raw.ItemPrice),
          unit_price: parseNumber(raw.UnitOfMeasurePrice),
          allow_discount: String(raw.AllowDiscount || '') === '1',
          price_update_at: raw.PriceUpdateDate || new Date().toISOString()
        };

        let priceRecord = priceByProductId.get(product.id);
        if (!priceRecord) {
          priceRecord = await svc.entities.ProductPrice.create(pricePayload);
          priceByProductId.set(product.id, priceRecord);
        } else {
          await svc.entities.ProductPrice.update(priceRecord.id, pricePayload);
        }

        processedCount++;
      } catch (e) {
        console.error('Item processing error:', e);
        errorCount++;
      }
    }

    // -------------------------------------------------------------------------
    // DONE
    // -------------------------------------------------------------------------

    return jsonResponse({
      success: true,
      file: fileName,
      chainId,
      storeId,
      totalItems: itemsXml.length,
      processedCount,
      errorCount
    });

  } catch (e) {
    return jsonResponse(
      { error: e?.message || String(e), stack: String(e?.stack || '').slice(0, 300) },
      500
    );
  }
});