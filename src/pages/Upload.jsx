import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UploadCloud, ScanLine, Loader2, Store, Settings, MapPin, FileText, Check, ChevronsUpDown, HelpCircle, Plus, Download, AlertCircle } from 'lucide-react';
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
  const [showChainSelector, setShowChainSelector] = useState(false);
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
      {/* Hero Header - Action First */}
      <div className="text-center space-y-1 relative">
        <div className="flex items-center justify-between absolute top-0 left-0 right-0">
          <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleExportAll} 
              disabled={isExporting}
              className="h-8 px-2 text-xs text-gray-400 hover:text-indigo-400 hover:bg-gray-800/50"
          >
              <Download className="w-4 h-4 mr-1" />
              Export
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
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

                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800">
                  <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-purple-600" />
                    Filter & Organize
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Use powerful filters to quickly find any receipt in your history.
                  </p>
                  <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">✓</span>
                      <span><strong>Date Range</strong> — Filter by specific time periods</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">✓</span>
                      <span><strong>Store Filter</strong> — View receipts from specific chains</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-purple-500 mt-0.5">✓</span>
                      <span><strong>Amount Range</strong> — Find receipts by total spent</span>
                    </li>
                  </ul>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="pt-10">
          <h2 className="text-2xl font-bold text-gray-100">Upload a receipt</h2>
          <p className="text-gray-500 text-sm">Spending, categories, and savings — automatically.</p>
        </div>
      </div>

      {/* Upload / Preview Area - HERO */}
      <Card className={`border-2 border-dashed overflow-hidden shadow-lg transition-all duration-200 ${
        isDragging 
          ? 'border-indigo-500 bg-indigo-900/20 shadow-indigo-500/20' 
          : preview 
            ? 'border-gray-700 bg-gray-800/50' 
            : 'border-gray-600 bg-gray-800/30 hover:border-indigo-500/50 hover:bg-gray-800/50'
      }`}>
        <CardContent className="p-0">
          {!preview ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`min-h-[200px] flex flex-col items-center justify-center cursor-pointer transition-all p-8 ${
                isDragging ? 'scale-[1.02]' : ''
              }`}
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all ${
                isDragging 
                  ? 'bg-indigo-500/30 text-indigo-300 scale-110' 
                  : 'bg-indigo-600/20 text-indigo-400'
              }`}>
                <UploadCloud className="w-8 h-8" />
              </div>
              <p className="font-semibold text-gray-200 text-lg">{isDragging ? 'Drop here' : 'Upload receipt'}</p>
              <p className="text-xs text-gray-500 mt-2">JPG, PNG, or PDF</p>
            </div>
          ) : (
            <div className="relative">
              {file && file.type === 'application/pdf' ? (
                <div className="h-48 flex flex-col items-center justify-center bg-gray-800/50 text-gray-400">
                  <FileText className="w-12 h-12 mb-2 text-indigo-400" />
                  <p className="font-medium text-gray-200 text-sm">{file.name}</p>
                  <p className="text-xs text-gray-500">PDF Document</p>
                </div>
              ) : (
                <img src={preview} alt="Receipt" className="w-full object-cover max-h-64 opacity-90" />
              )}
              <Button 
                variant="secondary" 
                size="sm" 
                className="absolute top-3 right-3 bg-gray-900/80 backdrop-blur border border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => {
                    setPreview(null);
                    setFile(null);
                }}
              >
                Change
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

      {/* Action Button - Prominent */}
      {preview && !isUploading && (
        <Button 
          onClick={uploadAndProcess} 
          disabled={!file}
          className="w-full h-12 text-base font-semibold bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all"
        >
          <ScanLine className="mr-2 w-5 h-5" /> Analyze Receipt
        </Button>
      )}

      {isUploading && (
        <Button disabled className="w-full h-12 bg-gray-800 border border-gray-700 text-gray-300">
          <Loader2 className="mr-2 w-5 h-5 animate-spin text-indigo-400" /> Processing...
        </Button>
      )}

      {/* Chain & Store Selection - De-emphasized */}
      <div className="space-y-3">
        <button 
          onClick={() => setShowChainSelector(!showChainSelector)}
          className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-700/50 hover:bg-gray-800/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Store className="w-4 h-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-300">
                {selectedChain ? selectedChain.name : 'Select chain'}
                {selectedStore && <span className="text-gray-500"> • {selectedStore.city || selectedStore.name}</span>}
              </p>
              <p className="text-[10px] text-gray-500">Optional — helps improve categorization</p>
            </div>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-gray-500" />
        </button>

        {showChainSelector && (
          <Card className="border-gray-700/50 bg-gray-800/50 animate-in fade-in slide-in-from-top-2 duration-200">
            <CardContent className="p-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Chain</label>
                {loadingChains ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : chains.length === 0 ? (
                  <div className="text-sm bg-amber-900/20 border border-amber-800/50 p-3 rounded-lg">
                    <p className="text-amber-300 text-xs">No chains available.</p>
                    {isAdmin && (
                      <Link to={createPageUrl('CatalogAdmin')}>
                        <Button size="sm" variant="outline" className="h-7 text-xs mt-2 border-amber-700 text-amber-300 hover:bg-amber-900/30">
                          <Settings className="w-3 h-3 mr-1" />
                          Add Chains
                        </Button>
                      </Link>
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
                    <SelectTrigger className="w-full bg-gray-900/50 border-gray-700 text-gray-200">
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

              {selectedChain && (
                <div className="animate-in fade-in">
                  <label className="text-xs font-medium text-gray-400 mb-2 block">
                    Store <span className="text-gray-600">(optional)</span>
                  </label>
                  {loadingStores ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm p-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Loading stores...</span>
                    </div>
                  ) : stores.length === 0 ? (
                     <p className="text-xs text-gray-500 italic">No stores found for this chain.</p>
                  ) : (
                    <Popover open={openStoreCombobox} onOpenChange={setOpenStoreCombobox}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openStoreCombobox}
                          className="w-full justify-between font-normal bg-gray-900/50 border-gray-700 text-gray-300 hover:bg-gray-800"
                        >
                          {selectedStore
                            ? `${selectedStore.name}${selectedStore.city ? ` - ${selectedStore.city}` : ''}`
                            : "Select store..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                        <Command>
                          <CommandInput placeholder="Search by city or address..." />
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
        )}
      </div>



      {/* Receipt History */}
      <section className="space-y-4 pt-6 border-t border-gray-700/50">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-200 text-base">Receipt History</h3>
            <span className="text-xs text-gray-500">{receipts.length} total</span>
          </div>

          <ReceiptFilters 
            receipts={receipts} 
            onFilteredReceipts={setFilteredReceipts} 
          />

          <ReceiptFolderView receipts={filteredReceipts} onDelete={handleDeleteReceipt} />
      </section>
    </div>
  );
}