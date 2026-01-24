import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle, Database, Upload, FileText } from 'lucide-react';

export default function CatalogAdmin() {
  // Upload states
  const [xmlFile, setXmlFile] = useState(null);
  const [chainName, setChainName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const handleFileUpload = async () => {
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

    try {
      // Step 1: Upload file to get URL
      const { file_url } = await base44.integrations.Core.UploadFile({ file: xmlFile });

      // Step 2: Process the uploaded file
      const response = await base44.functions.invoke('uploadCatalog', { 
        fileUrl: file_url,
        chain_name: chainName.trim()
      });

      if (response.data.error) {
        setUploadError(response.data.error);
      } else {
        setUploadResult(response.data);
        setXmlFile(null);
        setChainName('');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to upload file';
      setUploadError(errorMsg);
    } finally {
      setIsUploading(false);
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

          <Button 
            onClick={handleFileUpload} 
            disabled={isUploading || !xmlFile || !chainName.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {isUploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Upload & Process .gz File</>
            )}
          </Button>
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


    </div>
  );
}