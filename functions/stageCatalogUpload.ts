import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import { gunzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      // Check extended profile
      const profiles = await base44.entities.UserProfile.filter({ created_by: user?.email });
      if (!profiles.length || !profiles[0].is_admin) {
        return Response.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    const body = await req.json();
    const { fileUrl, chain_name } = body;

    if (!fileUrl || !chain_name) {
      return Response.json({ error: "fileUrl and chain_name are required" }, { status: 400 });
    }

    // 1. Fetch and Parse
    console.log("Fetching file...");
    const fileResponse = await fetch(fileUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressed = gunzipSync(new Uint8Array(compressedBuffer));
    let xmlText = new TextDecoder("utf-8").decode(decompressed);

    if (!xmlText.trim().startsWith('<?xml')) {
      xmlText = '<?xml version="1.0" encoding="utf-8"?>\n' + xmlText;
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
      ignoreDeclaration: true
    });

    const parsed = parser.parse(xmlText);
    const rootKey = Object.keys(parsed)[0];
    const root = parsed[rootKey];
    
    if (!root) return Response.json({ error: "Invalid XML" }, { status: 400 });

    const chainId = root.ChainId?.toString() || "";
    const storeId = root.StoreId?.toString() || "";
    const subChainId = root.SubChainId?.toString() || "";
    
    let items = root?.Items?.Item || [];
    if (!Array.isArray(items)) items = [items];

    // 2. Setup Chain & Store (Service Role)
    const svc = base44.asServiceRole;
    
    let chains = await svc.entities.Chain.filter({ external_chain_code: chainId });
    let chain = chains[0];
    
    if (!chain) {
      // Basic creation if new, skip LLM/OSM for speed in staging or keep it?
      // Keeping it to ensure consistency with original logic
      chain = await svc.entities.Chain.create({
        name: chain_name,
        external_chain_code: chainId,
        chain_type: "supermarket" 
      });
    } else {
        // Update name if needed
        await svc.entities.Chain.update(chain.id, { name: chain_name });
    }

    let stores = await svc.entities.Store.filter({
      chain_id: chain.id,
      external_store_code: storeId,
      sub_chain_code: subChainId
    });
    let store = stores[0];

    if (!store) {
      store = await svc.entities.Store.create({
        chain_id: chain.id,
        external_store_code: storeId,
        sub_chain_code: subChainId,
        name: chain_name
      });
    }

    // 3. Stage Items
    const jobId = crypto.randomUUID();
    const stagedItems = items.map(item => ({
      job_id: jobId,
      chain_id: chain.id,
      store_id: store.id,
      item_json: JSON.stringify(item),
      status: 'pending'
    }));

    // Batch insert staged items (chunk by 1000)
    for (let i = 0; i < stagedItems.length; i += 1000) {
        const batch = stagedItems.slice(i, i + 1000);
        await svc.entities.StagedCatalogItem.bulkCreate(batch);
    }

    return Response.json({
      success: true,
      jobId,
      totalItems: items.length,
      chainId: chain.id,
      storeId: store.id
    });

  } catch (error) {
    console.error("Stage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});