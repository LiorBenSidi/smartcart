import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, ScanLine, Loader2, Store } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const storeList = await base44.entities.Store.list();
        setStores(storeList);
      } catch (error) {
        console.error('Failed to load stores', error);
      } finally {
        setLoadingStores(false);
      }
    };
    fetchStores();
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const uploadAndProcess = async () => {
    if (!file || !selectedStore) return;
    setIsUploading(true);
    
    try {
      // 1. Upload the file
      const uploadRes = await base44.integrations.Core.UploadFile({
        file: file
      });
      const fileUrl = uploadRes.file_url;

      // 2. Create a pending receipt with store info
      const pendingReceipt = await base44.entities.Receipt.create({
        store_id: selectedStore.id,
        purchased_at: new Date().toISOString(),
        total_amount: 0,
        raw_receipt_image_url: fileUrl,
        processing_status: 'pending'
      });

      // 3. Redirect to the Receipt page - processing will happen there
      window.location.href = `${createPageUrl('Receipt')}?id=${pendingReceipt.id}`;

    } catch (error) {
      console.error("Error uploading receipt", error);
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Scan Receipt</h2>
        <p className="text-gray-500 text-sm">Upload a photo to analyze your groceries</p>
      </div>

      {/* Store Selection */}
      <Card className="shadow-sm">
        <CardContent className="p-6">
          <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Store className="w-4 h-4" />
            Select Supermarket
          </label>
          {loadingStores ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading stores...</span>
            </div>
          ) : (
            <Select value={selectedStore?.id} onValueChange={(id) => setSelectedStore(stores.find(s => s.id === id))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose your supermarket" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name} {store.external_store_code && `(${store.external_store_code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!selectedStore && stores.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">⚠️ Please select a store before uploading</p>
          )}
        </CardContent>
      </Card>

      {/* Upload / Preview Area */}
      <Card className="border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden shadow-none hover:border-indigo-300 transition-colors">
        <CardContent className="p-0">
          {!preview ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="h-64 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors p-6"
            >
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 text-indigo-600">
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="font-medium text-gray-900">Tap to upload receipt</p>
              <p className="text-xs text-gray-400 mt-2">Supports JPG, PNG</p>
            </div>
          ) : (
            <div className="relative">
              <img src={preview} alt="Receipt" className="w-full object-cover max-h-80 opacity-90" />
              <Button 
                variant="secondary" 
                size="sm" 
                className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-sm hover:bg-white"
                onClick={() => {
                    setPreview(null);
                    setFile(null);
                }}
              >
                Retake
              </Button>
            </div>
          )}
          <Input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
        </CardContent>
      </Card>

      {/* Action Button */}
      <div className="space-y-4">
        {preview && !isUploading && (
          <Button 
            onClick={uploadAndProcess} 
            disabled={!selectedStore}
            className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-md disabled:opacity-50"
          >
            <ScanLine className="mr-2 w-5 h-5" /> Upload & Analyze
          </Button>
        )}

        {isUploading && (
          <Button disabled className="w-full h-12 bg-white border border-gray-200 text-gray-900">
            <Loader2 className="mr-2 w-5 h-5 animate-spin text-indigo-600" /> Uploading...
          </Button>
        )}

        {preview && (
          <p className="text-center text-xs text-gray-400">
            You'll be redirected while we analyze your receipt in the background
          </p>
        )}
      </div>
    </div>
  );
}