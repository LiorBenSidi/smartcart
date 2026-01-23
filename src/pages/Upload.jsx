import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadCloud, ScanLine, Loader2, Store, Settings, MapPin, FileText, Check, ChevronsUpDown, HelpCircle, Plus, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "@/components/lib/utils";
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ReceiptFolderView from '../components/ReceiptFolderView';
import ReceiptFilters from '../components/ReceiptFilters';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [chains, setChains] = useState([]);
  const [selectedChain, setSelectedChain] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);
  const [loadingChains, setLoadingChains] = useState(true);
  const [loadingStores, setLoadingStores] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [filteredReceipts, setFilteredReceipts] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleDeleteReceipt = async (receiptId) => {
    if (confirm("Are you sure you want to delete this receipt?")) {
        try {
            await base44.entities.Receipt.delete(receiptId);
            setReceipts(receipts.filter(r => r.id !== receiptId));
        } catch (error) {
            console.error("Failed to delete receipt", error);
            alert("Failed to delete receipt");
        }
    }
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const user = await base44.auth.me();
      // Fetch all receipts for export
      const allReceipts = await base44.entities.Receipt.filter({ created_by: user.email });
      
      const headers = ['Date', 'Store', 'Address', 'Total Amount', 'Item Name', 'Category', 'Quantity', 'Price', 'Item Total'];
      const rows = [];

      allReceipts.forEach(r => {
        if (r.items && r.items.length > 0) {
            r.items.forEach(item => {
                rows.push([
                    r.date,
                    `"${r.storeName}"`,
                    `"${r.address || ''}"`,
                    r.totalAmount,
                    `"${item.name}"`,
                    item.category,
                    item.quantity,
                    item.price,
                    item.total
                ].join(','));
            });
        } else {
             rows.push([
                    r.date,
                    `"${r.storeName}"`,
                    `"${r.address || ''}"`,
                    r.totalAmount,
                    '',
                    '',
                    '',
                    '',
                    ''
                ].join(','));
        }
      });

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `all_receipts_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await base44.auth.me();
        
        // Fetch receipts
        try {
            const userReceipts = await base44.entities.Receipt.filter({ created_by: user.email }, '-date', 20);
            setReceipts(userReceipts);
        } catch (e) { console.error("Failed to fetch receipts", e); }
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
        console.log('Loaded chains:', chainList.length);
        setChains(chainList);
      } catch (error) {
        console.error('Failed to load chains', error);
      } finally {
        setLoadingChains(false);
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
    if (droppedFile && (droppedFile.type.startsWith('image/') || droppedFile.type === 'application/pdf')) {
      setFile(droppedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(droppedFile);
    }
  };

  const uploadAndProcess = async () => {
    if (!file) return;
    setIsUploading(true);
    
    try {
      // 1. Upload the file
      const uploadRes = await base44.integrations.Core.UploadFile({
        file: file
      });
      const fileUrl = uploadRes.file_url;

      // 2. Create a pending receipt with store info (if selected)
      const receiptData = {
        purchased_at: new Date().toISOString(),
        total_amount: 0,
        raw_receipt_image_url: fileUrl,
        processing_status: 'pending',
        store_id: selectedStore?.id,
        storeName: selectedStore?.name || selectedChain?.name
      };
      


      const pendingReceipt = await base44.entities.Receipt.create(receiptData);

      // 3. Redirect to the Receipt page - processing will happen there
      window.location.href = `${createPageUrl('Receipt')}?id=${pendingReceipt.id}`;

    } catch (error) {
      console.error("Error uploading receipt", error);
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-2xl mx-auto">
      <div className="text-center space-y-2 relative">
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleExportAll} 
            disabled={isExporting}
            className="absolute top-0 left-0 h-8 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50"
        >
            <Download className="w-4 h-4 mr-1" />
            Export
        </Button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scan Receipt</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Upload a photo to analyze your groceries</p>
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              size="icon" 
              variant="ghost" 
              className="absolute top-0 right-0 h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <HelpCircle className="h-5 w-5 text-gray-400 hover:text-indigo-600" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-indigo-600" />
                How Receipt Scanning Works
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2 mb-4">
              Scanning receipts unlocks powerful insights — track spending, discover savings, and build smarter shopping habits automatically.
            </p>
            <div className="space-y-4 text-sm">
              <div className="bg-slate-50 dark:bg-slate-900/20 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                <h4 className="font-semibold mb-2 text-slate-900 dark:text-slate-200 flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-slate-600" />
                  Quick & Easy Upload
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Just snap a photo or drag & drop — we handle the rest in seconds.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>1. Upload</strong> — Photo, scan, or PDF</div>
                  <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>2. Process</strong> — AI reads your receipt</div>
                  <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>3. Review</strong> — Verify extracted data</div>
                  <div className="bg-white dark:bg-gray-800 p-2 rounded"><strong>4. Insights</strong> — See savings opportunities</div>
                </div>
              </div>
              
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-indigo-600" />
                  Smart AI Extraction
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Our AI reads your receipt image and extracts every detail automatically.
                </p>
                <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span><strong>Store Info</strong> — Name, address, date & time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span><strong>Every Item</strong> — Product names, quantities, prices & categories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span><strong>Total Verification</strong> — Cross-checks amounts for accuracy</span>
                  </li>
                </ul>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800">
                <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-600" />
                  Accuracy You Can Trust
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  We flag uncertain data so you can verify — no guesswork, no errors.
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded font-medium">90%+ confident</span>
                    <span className="text-gray-600 dark:text-gray-400">Auto-approved, no action needed</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded font-medium">Below 90%</span>
                    <span className="text-gray-600 dark:text-gray-400">Flagged for your quick review</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
                <h4 className="font-semibold mb-2 text-green-900 dark:text-green-200 flex items-center gap-2">
                  <Store className="w-4 h-4 text-green-600" />
                  Automatic Savings Analysis
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  After scanning, we compare your prices to market data and find savings.
                </p>
                <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                  <li>💰 <strong>Price Check</strong> — See if you paid above market average</li>
                  <li>🔄 <strong>Swap Suggestions</strong> — Cheaper alternatives in the same category</li>
                  <li>📊 <strong>Trip Summary</strong> — Total potential savings per receipt</li>
                  <li>📈 <strong>Habit Tracking</strong> — Builds your purchase history for smarter tips</li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Chain & Store Selection */}
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Store className="w-4 h-4" />
              Select Chain
            </label>
            {loadingChains ? (
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
              <Select value={selectedChain?.id} onValueChange={async (id) => {
                const chain = chains.find(c => c.id === id);
                setSelectedChain(chain);
                setSelectedStore(null);
                setStores([]);
                
                if (chain) {
                  setLoadingStores(true);
                  try {
                    const chainStores = await base44.entities.Store.filter({ chain_id: chain.id });
                    setStores(chainStores);
                  } catch (err) {
                    console.error("Failed to load stores", err);
                  } finally {
                    setLoadingStores(false);
                  }
                }
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

          {/* Store Selection */}
          {selectedChain && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Select Store (Optional)
              </label>
              {loadingStores ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm p-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Loading stores...</span>
                </div>
              ) : stores.length === 0 ? (
                 <p className="text-xs text-gray-500 italic p-1">No stores found for this chain.</p>
              ) : (
                <Popover open={openStoreCombobox} onOpenChange={setOpenStoreCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openStoreCombobox}
                      className="w-full justify-between font-normal"
                    >
                      {selectedStore
                        ? `${selectedStore.name}${selectedStore.city ? ` - ${selectedStore.city}` : ''}`
                        : "Select specific store..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search store by city or address..." />
                      <CommandList>
                        <CommandEmpty>No store found.</CommandEmpty>
                        {Object.entries(
                          stores.reduce((acc, store) => {
                            const city = store.city || 'Other';
                            if (!acc[city]) acc[city] = [];
                            acc[city].push(store);
                            return acc;
                          }, {})
                        ).sort((a, b) => a[0].localeCompare(b[0])).map(([city, cityStores]) => (
                          <CommandGroup key={city} heading={city}>
                            {cityStores.map((store) => (
                              <CommandItem
                                key={store.id}
                                value={`${store.name} ${store.city || ''} ${store.address_line || ''}`}
                                onSelect={() => {
                                  setSelectedStore(store);
                                  setOpenStoreCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedStore?.id === store.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{store.name}</span>
                                  {store.address_line && (
                                    <span className="text-xs text-gray-500">{store.address_line}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
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
              <p className="text-xs text-gray-400 mt-2">Supports JPG, PNG, PDF</p>
            </div>
          ) : (
            <div className="relative">
              {file && file.type === 'application/pdf' ? (
                <div className="h-80 flex flex-col items-center justify-center bg-gray-100 text-gray-500">
                  <FileText className="w-16 h-16 mb-2 text-indigo-500" />
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-400">PDF Document</p>
                </div>
              ) : (
                <img src={preview} alt="Receipt" className="w-full object-cover max-h-80 opacity-90" />
              )}
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
            accept="image/*,application/pdf" 
            onChange={handleFileChange} 
          />
        </CardContent>
      </Card>

      {/* Action Button */}
      <div className="space-y-4">
        {preview && !isUploading && (
          <Button 
            onClick={uploadAndProcess} 
            disabled={!file}
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

      {/* Receipt History (Folder View) */}
      <section className="space-y-4 pt-8 border-t border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Receipt History</h3>

          <ReceiptFilters 
            receipts={receipts} 
            onFilteredReceipts={setFilteredReceipts} 
          />

          <ReceiptFolderView receipts={filteredReceipts} onDelete={handleDeleteReceipt} />
      </section>
    </div>
  );
}