import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { gunzipSync } from 'npm:fflate@0.8.2';

const LOGIN_URL = 'https://url.publishedprices.co.il/login';
const FILE_LIST_URL = 'https://url.publishedprices.co.il/file';
const FILE_DOWNLOAD_URL = 'https://url.publishedprices.co.il/file/d';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    let isAdmin = user.email === 'liorben@base44.com';
    if (!isAdmin) {
      const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
      isAdmin = profiles.length > 0 && profiles[0].isAdmin;
    }

    if (!isAdmin) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const username = body.username;
    const password = body.password || '';
    const filePattern = body.filePattern || 'PriceFull';

    if (!username) {
      return Response.json({ error: 'Username is required' }, { status: 400 });
    }

    // Step 1: Login to get session cookies
    console.log(`Logging in as ${username}...`);
    const loginFormData = new URLSearchParams();
    loginFormData.append('username', username);
    loginFormData.append('password', password);

    const loginResponse = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: loginFormData,
      redirect: 'manual',
    });

    // Extract cookies from login response
    const cookies = loginResponse.headers.getSetCookie();
    if (!cookies || cookies.length === 0) {
      return Response.json({ error: 'Login failed - no session cookies received' }, { status: 401 });
    }

    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Login successful, got cookies');

    // Step 2: Fetch file list
    console.log('Fetching file list...');
    const fileListResponse = await fetch(FILE_LIST_URL + '/json', {
      headers: {
        'Cookie': cookieHeader,
      },
    });

    if (!fileListResponse.ok) {
      return Response.json({ error: 'Failed to fetch file list' }, { status: 500 });
    }

    const fileListData = await fileListResponse.json();
    
    // Step 3: Find the latest matching file
    const files = fileListData.files || fileListData || [];
    const matchingFiles = files.filter(f => {
      const name = f.name || f.fname || f;
      return typeof name === 'string' && name.includes(filePattern) && name.endsWith('.gz');
    });

    if (matchingFiles.length === 0) {
      return Response.json({ error: `No ${filePattern}*.gz files found` }, { status: 404 });
    }

    // Sort by timestamp in filename (descending) and pick the latest
    matchingFiles.sort((a, b) => {
      const nameA = a.name || a.fname || a;
      const nameB = b.name || b.fname || b;
      return nameB.localeCompare(nameA);
    });

    const latestFile = matchingFiles[0];
    const fileName = latestFile.name || latestFile.fname || latestFile;
    console.log(`Selected file: ${fileName}`);

    // Step 4: Download the file
    console.log('Downloading file...');
    const downloadResponse = await fetch(`${FILE_DOWNLOAD_URL}/${encodeURIComponent(fileName)}`, {
      headers: {
        'Cookie': cookieHeader,
      },
    });

    if (!downloadResponse.ok) {
      return Response.json({ error: 'Failed to download file' }, { status: 500 });
    }

    const compressedData = new Uint8Array(await downloadResponse.arrayBuffer());
    console.log(`Downloaded ${compressedData.length} bytes`);

    // Step 5: Decompress
    console.log('Decompressing...');
    const decompressedData = gunzipSync(compressedData);
    const xmlString = new TextDecoder().decode(decompressedData);
    console.log(`Decompressed to ${xmlString.length} characters`);

    // Step 6: Parse XML manually (simple extraction)
    const getXmlValue = (xml, tag) => {
      const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return match ? match[1].trim() : '';
    };

    const chainId = getXmlValue(xmlString, 'ChainId');
    const subChainId = getXmlValue(xmlString, 'SubChainId');
    const storeId = getXmlValue(xmlString, 'StoreId');

    console.log(`Chain: ${chainId}, SubChain: ${subChainId}, Store: ${storeId}`);

    // Step 7: Find or create chain
    let chains = await base44.asServiceRole.entities.Chain.filter({ external_chain_id: chainId });
    let chain;
    if (chains.length === 0) {
      chain = await base44.asServiceRole.entities.Chain.create({
        name: username,
        external_chain_id: chainId
      });
    } else {
      chain = chains[0];
    }

    // Step 8: Find or create store
    let stores = await base44.asServiceRole.entities.Store.filter({ 
      chain_id: chain.id, 
      external_store_id: storeId 
    });
    let store;
    if (stores.length === 0) {
      store = await base44.asServiceRole.entities.Store.create({
        chain_id: chain.id,
        external_store_id: storeId,
        sub_chain_id: subChainId,
        name: `${username} - Store ${storeId}`
      });
    } else {
      store = stores[0];
    }

    // Step 9: Parse items
    const itemMatches = xmlString.matchAll(/<Item>([\s\S]*?)<\/Item>/g);
    const items = [];
    
    for (const match of itemMatches) {
      const itemXml = match[1];
      items.push({
        itemCode: getXmlValue(itemXml, 'ItemCode'),
        itemName: getXmlValue(itemXml, 'ItemName'),
        manufacturerName: getXmlValue(itemXml, 'ManufacturerName'),
        description: getXmlValue(itemXml, 'ManufacturerItemDescription'),
        unitQty: parseFloat(getXmlValue(itemXml, 'UnitQty')) || 0,
        unitOfMeasure: getXmlValue(itemXml, 'UnitOfMeasure'),
        qtyInPackage: parseFloat(getXmlValue(itemXml, 'QtyInPackage')) || 0,
        isWeighted: getXmlValue(itemXml, 'bIsWeighted') === '1',
        itemType: getXmlValue(itemXml, 'ItemType'),
        itemStatus: getXmlValue(itemXml, 'ItemStatus'),
        itemPrice: parseFloat(getXmlValue(itemXml, 'ItemPrice')) || 0,
        unitOfMeasurePrice: parseFloat(getXmlValue(itemXml, 'UnitOfMeasurePrice')) || 0,
        allowDiscount: getXmlValue(itemXml, 'AllowDiscount') === '1',
        priceUpdateDate: getXmlValue(itemXml, 'PriceUpdateDate')
      });
    }

    console.log(`Found ${items.length} items`);

    // Step 10: Process items in batches
    let processedCount = 0;
    let errorCount = 0;
    const batchSize = 50;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      for (const item of batch) {
        try {
          // Find or create product
          let products = await base44.asServiceRole.entities.Product.filter({
            chain_id: chain.id,
            external_item_code: item.itemCode
          });

          let product;
          const productData = {
            chain_id: chain.id,
            external_item_code: item.itemCode,
            name: item.itemName,
            brand: item.manufacturerName,
            description: item.description,
            unit_of_measure: item.unitOfMeasure,
            unit_qty: item.unitQty,
            qty_in_package: item.qtyInPackage,
            is_weighted: item.isWeighted,
            item_type: item.itemType,
            status: item.itemStatus
          };

          if (products.length === 0) {
            product = await base44.asServiceRole.entities.Product.create(productData);
          } else {
            product = products[0];
            await base44.asServiceRole.entities.Product.update(product.id, productData);
          }

          // Find or create price record
          let prices = await base44.asServiceRole.entities.ProductPrice.filter({
            product_id: product.id,
            store_id: store.id
          });

          const priceData = {
            product_id: product.id,
            store_id: store.id,
            price: item.itemPrice,
            unit_price: item.unitOfMeasurePrice,
            allow_discount: item.allowDiscount,
            price_update_at: item.priceUpdateDate || new Date().toISOString()
          };

          if (prices.length === 0) {
            await base44.asServiceRole.entities.ProductPrice.create(priceData);
          } else {
            await base44.asServiceRole.entities.ProductPrice.update(prices[0].id, priceData);
          }

          processedCount++;
        } catch (err) {
          console.error(`Error processing item ${item.itemCode}:`, err.message);
          errorCount++;
        }
      }

      console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length} items`);
    }

    return Response.json({
      success: true,
      summary: {
        file: fileName,
        chain: username,
        chainId,
        storeId,
        totalItems: items.length,
        processedCount,
        errorCount
      }
    });

  } catch (error) {
    console.error('Catalog update error:', error);
    const errorMessage = error.message || String(error);
    const errorStack = error.stack || '';
    return Response.json({ 
      error: errorMessage,
      details: errorStack.substring(0, 500) 
    }, { status: 500 });
  }
});