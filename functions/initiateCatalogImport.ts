import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

export default Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      // Check secondary admin flag
      const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
      if (!profiles[0]?.is_admin) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    const { fileUrl, chain_name } = await req.json();

    if (!fileUrl || !chain_name) {
      return Response.json({ error: "Missing fileUrl or chain_name" }, { status: 400 });
    }

    // 1. Fetch & Parse
    console.log("Fetching and decompressing...");
    const fileResponse = await fetch(fileUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressed = gunzipSync(new Uint8Array(compressedBuffer));
    let xmlText = new TextDecoder("utf-8").decode(decompressed);

    if (!xmlText.trim().startsWith('<?xml')) {
      xmlText = '<?xml version="1.0" encoding="utf-8"?>\n' + xmlText;
    }

    console.log("Parsing XML...");
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
      ignoreDeclaration: true
    });

    const parsed = parser.parse(xmlText);
    const rootKey = Object.keys(parsed)[0];
    const root = parsed[rootKey];
    
    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    const importId = crypto.randomUUID();
    const chainIdStr = root.ChainId?.toString() || "";
    const storeIdStr = root.StoreId?.toString() || "";
    const subChainIdStr = root.SubChainId?.toString() || "";

    // 2. Resolve Chain & Store (Service Role)
    const svc = base44.asServiceRole;
    
    // Find or Create Chain
    let chains = await svc.entities.Chain.filter({ external_chain_code: chainIdStr });
    let chain = chains[0];
    
    if (!chain) {
        chain = await svc.entities.Chain.create({
            name: chain_name,
            external_chain_code: chainIdStr,
            chain_type: "supermarket"
        });
    }

    // Find or Create Store
    let stores = await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_code: storeIdStr,
      sub_chain_code: subChainIdStr
    });
    let store = stores[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_code: storeIdStr,
        sub_chain_code: subChainIdStr,
        name: chain_name
      });
    }

    // 3. Stage Items
    console.log(`Staging ${items.length} items with importId: ${importId}`);
    
    // Batch insert into TempCatalogItem
    // We can do this in larger chunks since it's just raw data dump
    const STAGE_BATCH_SIZE = 500;
    for (let i = 0; i < items.length; i += STAGE_BATCH_SIZE) {
        const batch = items.slice(i, i + STAGE_BATCH_SIZE).map(item => ({
            import_id: importId,
            raw_data: item,
            chain_id: chain.id,
            store_id: store.id,
            status: 'pending'
        }));
        await svc.entities.TempCatalogItem.bulkCreate(batch);
    }

    return Response.json({
        success: true,
        importId,
        totalItems: items.length,
        chainId: chain.id,
        storeId: store.id
    });

  } catch (error) {
    console.error("Init Import Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});