import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, CheckCircle, AlertCircle, Database, Upload, FileText } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function CatalogAdmin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [filePattern, setFilePattern] = useState('PriceFull');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Upload states
  const [xmlFile, setXmlFile] = useState(null);
  const [chainName, setChainName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  // Staging & Sync State
  const [jobId, setJobId] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [processedItems, setProcessedItems] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // 'staging', 'ready', 'syncing', 'complete'

  // Pagination View
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [viewProducts, setViewProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  React.useEffect(() => {
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const prods = await base44.entities.Product.list('-created_date', pageSize, page * pageSize);
        setViewProducts(prods);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [page, syncStatus]); // Refresh when sync status changes (completed batch)

  const runCatalogUpdate = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await base44.functions.invoke('catalogUpdate', {
        username,
        password,
        filePattern
      });

      if (response.data.error) {
        setError(response.data.error);
      } else {
        setResult(response.data);
      }
    } catch (err) {
      // Extract error message from response if available
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to update catalog';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStageCatalog = async () => {
    if (!xmlFile) {
      setUploadError('Please select a file first');
      return;
    }
    if (!chainName.trim()) {
      setUploadError('Please enter a Chain name');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    setUploadError(null);
    setSyncStatus('staging');

    try {
      // Step 1: Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file: xmlFile });

      // Step 2: Stage the catalog
      const response = await base44.functions.invoke('stageCatalogUpload', { 
        fileUrl: file_url,
        chain_name: chainName.trim()
      });

      if (response.data.error) {
        setUploadError(response.data.error);
        setSyncStatus(null);
      } else {
        const { jobId, totalItems } = response.data;
        setJobId(jobId);
        setTotalItems(totalItems);
        setProcessedItems(0);
        setSyncStatus('ready');
        setUploadResult(response.data);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to stage catalog';
      setUploadError(errorMsg);
      setSyncStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSync = async () => {
    if (!jobId) return;
    
    setIsSyncing(true);
    setSyncStatus('syncing');
    let currentProcessed = processedItems;
    let hasMore = true;

    try {
      while (hasMore) {
        // Process a batch
        const res = await base44.functions.invoke('processCatalogBatch', { 
          jobId, 
          limit: 1000 
        });

        if (res.data.error) throw new Error(res.data.error);

        const { processed, hasMore: more, remaining } = res.data;
        
        currentProcessed += processed;
        setProcessedItems(currentProcessed);
        hasMore = more;

        if (hasMore) {
          // Wait 5 seconds before next batch
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      setSyncStatus('complete');
      setXmlFile(null);
      setChainName('');
    } catch (err) {
      setUploadError(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="bg-slate-800 text-white p-6 rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-6 h-6 text-emerald-400" />
          Catalog Ingestion
        </h1>
        <p className="text-slate-300 text-sm mt-1">Import price feeds from publishedprices.co.il or upload XML directly</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload XML File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Chain Name *
            </label>
            <Input
              type="text"
              value={chainName}
              onChange={(e) => setChainName(e.target.value)}
              placeholder="e.g., Osher Ad, Rami Levy, Shufersal"
              className="mb-4"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Select .gz File from Your Computer
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept=".gz"
                onChange={(e) => setXmlFile(e.target.files[0])}
                className="flex-1"
              />
              {xmlFile && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileText className="w-4 h-4" />
                  <span className="truncate max-w-xs">{xmlFile.name}</span>
                </div>
              )}
            </div>
          </div>

          {!syncStatus || syncStatus === 'staging' ? (
            <Button 
              onClick={handleStageCatalog} 
              disabled={isUploading || !xmlFile || !chainName.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isUploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Staging Catalog...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Stage Catalog (Step 1)</>
              )}
            </Button>
          ) : (
             <div className="space-y-4">
               <div className="bg-slate-100 p-4 rounded-lg">
                 <div className="flex justify-between text-sm mb-2">
                   <span>Progress</span>
                   <span className="font-bold">{processedItems} / {totalItems}</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-2.5">
                   <div 
                     className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500" 
                     style={{ width: `${Math.min((processedItems / totalItems) * 100, 100)}%` }}
                   ></div>
                 </div>
                 <p className="text-xs text-gray-500 mt-2 text-center">
                   {syncStatus === 'syncing' ? 'Syncing batches (1000 items / 5s)...' : 'Ready to Sync'}
                 </p>
               </div>
               
               {syncStatus === 'complete' ? (
                 <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => setSyncStatus(null)}>
                   <CheckCircle className="w-4 h-4 mr-2" /> Complete! Reset
                 </Button>
               ) : (
                 <Button 
                   onClick={handleSync} 
                   disabled={isSyncing}
                   className="w-full bg-indigo-600 hover:bg-indigo-700"
                 >
                   {isSyncing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
                   ) : (
                      <><Database className="w-4 h-4 mr-2" /> Start Sync (Step 2)</>
                   )}
                 </Button>
               )}
             </div>
          )}
        </CardContent>
      </Card>

      {uploadError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-800">Upload Error</h4>
              <p className="text-sm text-red-700">{uploadError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {uploadResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-green-800">Upload Successful</h4>
                <p className="text-sm text-green-700">XML file processed successfully</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Chain ID:</span>
                <span className="font-medium">{uploadResult.chainId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Store ID:</span>
                <span className="font-medium">{uploadResult.storeId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Items:</span>
                <span className="font-bold text-indigo-600">{uploadResult.totalItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Processed:</span>
                <span className="font-bold text-green-600">{uploadResult.processed}</span>
              </div>
              {uploadResult.failed > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Failed:</span>
                  <span className="font-bold text-red-600">{uploadResult.failed}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Chain Username *</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., TivTaam, RamiLevi, Shufersal"
            />
            <p className="text-xs text-gray-500 mt-1">Username for login at publishedprices.co.il (required)</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty if not required"
            />
            <p className="text-xs text-gray-500 mt-1">Optional - leave empty if the chain doesn't require a password</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">File Type</label>
            <Select value={filePattern} onValueChange={setFilePattern}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PriceFull">PriceFull (Full prices)</SelectItem>
                <SelectItem value="Price">Price (Price updates)</SelectItem>
                <SelectItem value="PromoFull">PromoFull (Promotions)</SelectItem>
                <SelectItem value="Stores">Stores (Store list)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={runCatalogUpdate} 
            disabled={isLoading || !username}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" /> Run Catalog Update</>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-800">Error</h4>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-green-800">Success</h4>
                <p className="text-sm text-green-700">Catalog updated successfully</p>
              </div>
            </div>
            {/* ... result details ... */}
          </CardContent>
        </Card>
      )}

      {/* Product Viewer */}
      <Card>
          <CardHeader>
              <CardTitle>Catalog Products</CardTitle>
          </CardHeader>
          <CardContent>
              <div className="border rounded-md">
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>GTIN</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Brand</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {loadingProducts ? (
                              <TableRow>
                                  <TableCell colSpan={3} className="text-center py-4">Loading...</TableCell>
                              </TableRow>
                          ) : viewProducts.length === 0 ? (
                              <TableRow>
                                  <TableCell colSpan={3} className="text-center py-4">No products found</TableCell>
                              </TableRow>
                          ) : (
                              viewProducts.map(p => (
                                  <TableRow key={p.id}>
                                      <TableCell className="font-mono text-xs">{p.gtin}</TableCell>
                                      <TableCell>{p.canonical_name}</TableCell>
                                      <TableCell>{p.brand_name}</TableCell>
                                  </TableRow>
                              ))
                          )}
                      </TableBody>
                  </Table>
              </div>
              <div className="flex items-center justify-end space-x-2 py-4">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                  >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                  </Button>
                  <div className="text-sm font-medium">Page {page + 1}</div>
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={viewProducts.length < pageSize}
                  >
                      Next
                      <ChevronRight className="h-4 w-4" />
                  </Button>
              </div>
          </CardContent>
      </Card>
    </div>
  );
}