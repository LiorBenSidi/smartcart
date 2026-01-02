import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, ScanLine, Loader2, Store, Settings, MapPin } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chains, setChains] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedChain, setSelectedChain] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await base44.auth.me();
        const adminStatus = user.role === 'admin';
        if (!adminStatus) {
          const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
          if (profiles.length > 0 && profiles[0].is_admin) {
            setIsAdmin(true);
          }
        } else {
          setIsAdmin(true);
        }
        
        const chainList = await base44.entities.Chain.list('-name', 1000);
        const storeList = await base44.entities.Store.list('-name', 1000);
        console.log('Loaded chains:', chainList.length, 'stores:', storeList.length);
        setChains(chainList);
        setStores(storeList);
      } catch (error) {
        console.error('Failed to load stores', error);
      } finally {
        setLoadingStores(false);
      }
    };
    fetchData();
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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      setFile(droppedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(droppedFile);
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

      {/* Chain & Store Selection */}
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Store className="w-4 h-4" />
              Select Chain
            </label>
            {loadingStores ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading chains...</span>
              </div>
            ) : chains.length === 0 ? (
              <div className="text-sm bg-amber-50 border border-amber-200 p-4 rounded-lg space-y-2">
                <p className="text-amber-800 font-medium">No chains available in the system.</p>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <p className="text-amber-700 text-xs">Add chains through the catalog admin:</p>
                    <Link to={createPageUrl('CatalogAdmin')}>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 hover:bg-amber-100">
                        <Settings className="w-3 h-3 mr-1" />
                        Catalog Admin
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-amber-700 text-xs">Please contact an administrator to add chains.</p>
                )}
              </div>
            ) : (
              <Select value={selectedChain?.id} onValueChange={(id) => {
                setSelectedChain(chains.find(c => c.id === id));
                setSelectedStore(null);
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose chain" />
                </SelectTrigger>
                <SelectContent>
                  {chains.map((chain) => (
                    <SelectItem key={chain.id} value={chain.id}>
                      {chain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>



          {!selectedStore && chains.length > 0 && (
            <p className="text-xs text-amber-600">⚠️ Please select chain and store before uploading</p>
          )}
        </CardContent>
      </Card>

      {/* Upload / Preview Area */}
      <Card className={`border-2 border-dashed bg-gray-50 overflow-hidden shadow-none transition-colors ${
        isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
      }`}>
        <CardContent className="p-0">
          {!preview ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`h-64 flex flex-col items-center justify-center cursor-pointer transition-colors p-6 ${
                isDragging ? 'bg-indigo-100' : 'hover:bg-gray-100'
              }`}
            >
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                isDragging ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-100 text-indigo-600'
              }`}>
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="font-medium text-gray-900">{isDragging ? 'Drop receipt here' : 'Tap to upload receipt'}</p>
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