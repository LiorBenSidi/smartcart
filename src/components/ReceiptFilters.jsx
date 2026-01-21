import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { CalendarIcon, Filter, X, ArrowUpDown, Search } from 'lucide-react';
import { cn } from "@/components/lib/utils";

export default function ReceiptFilters({ receipts, onFilteredReceipts }) {
    const [dateRange, setDateRange] = useState('all');
    const [customStartDate, setCustomStartDate] = useState(null);
    const [customEndDate, setCustomEndDate] = useState(null);
    const [storeSearch, setStoreSearch] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [sortBy, setSortBy] = useState('date-desc');
    const [showFilters, setShowFilters] = useState(false);

    // Get unique store names for suggestions
    const storeNames = useMemo(() => {
        const names = [...new Set(receipts.map(r => r.storeName).filter(Boolean))];
        return names.sort();
    }, [receipts]);

    // Apply filters and sorting
    const filteredReceipts = useMemo(() => {
        let result = [...receipts];

        // Date filter
        const now = new Date();
        let startDate = null;
        let endDate = now;

        switch (dateRange) {
            case 'last7days':
                startDate = subDays(now, 7);
                break;
            case 'last30days':
                startDate = subDays(now, 30);
                break;
            case 'thisMonth':
                startDate = startOfMonth(now);
                endDate = endOfMonth(now);
                break;
            case 'lastMonth':
                const lastMonth = subMonths(now, 1);
                startDate = startOfMonth(lastMonth);
                endDate = endOfMonth(lastMonth);
                break;
            case 'custom':
                startDate = customStartDate;
                endDate = customEndDate || now;
                break;
            default:
                startDate = null;
        }

        if (startDate) {
            result = result.filter(r => {
                const receiptDate = r.date ? parseISO(r.date) : new Date(r.purchased_at);
                return isWithinInterval(receiptDate, { start: startDate, end: endDate });
            });
        }

        // Store filter
        if (storeSearch.trim()) {
            const search = storeSearch.toLowerCase();
            result = result.filter(r => 
                r.storeName?.toLowerCase().includes(search)
            );
        }

        // Amount filter
        if (minAmount) {
            result = result.filter(r => (r.totalAmount || 0) >= parseFloat(minAmount));
        }
        if (maxAmount) {
            result = result.filter(r => (r.totalAmount || 0) <= parseFloat(maxAmount));
        }

        // Sorting
        result.sort((a, b) => {
            switch (sortBy) {
                case 'date-desc':
                    return new Date(b.date || b.purchased_at) - new Date(a.date || a.purchased_at);
                case 'date-asc':
                    return new Date(a.date || a.purchased_at) - new Date(b.date || b.purchased_at);
                case 'amount-desc':
                    return (b.totalAmount || 0) - (a.totalAmount || 0);
                case 'amount-asc':
                    return (a.totalAmount || 0) - (b.totalAmount || 0);
                default:
                    return 0;
            }
        });

        return result;
    }, [receipts, dateRange, customStartDate, customEndDate, storeSearch, minAmount, maxAmount, sortBy]);

    // Update parent when filters change
    React.useEffect(() => {
        onFilteredReceipts(filteredReceipts);
    }, [filteredReceipts, onFilteredReceipts]);

    const clearFilters = () => {
        setDateRange('all');
        setCustomStartDate(null);
        setCustomEndDate(null);
        setStoreSearch('');
        setMinAmount('');
        setMaxAmount('');
        setSortBy('date-desc');
    };

    const hasActiveFilters = dateRange !== 'all' || storeSearch || minAmount || maxAmount;

    return (
        <div className="space-y-3">
            {/* Toggle and Sort Row */}
            <div className="flex items-center gap-2 flex-wrap">
                <Button
                    variant={showFilters ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn("gap-2", showFilters && "bg-indigo-600")}
                >
                    <Filter className="w-4 h-4" />
                    Filters
                    {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                    )}
                </Button>

                <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[160px] h-9">
                        <ArrowUpDown className="w-4 h-4 mr-2" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="date-desc">Newest First</SelectItem>
                        <SelectItem value="date-asc">Oldest First</SelectItem>
                    </SelectContent>
                </Select>

                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-gray-500">
                        <X className="w-4 h-4" />
                        Clear
                    </Button>
                )}

                <span className="text-xs text-gray-500 ml-auto">
                    {filteredReceipts.length} of {receipts.length} receipts
                </span>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-2">
                    {/* Date Range */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date Range</label>
                        <Select value={dateRange} onValueChange={setDateRange}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="All time" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="last7days">Last 7 Days</SelectItem>
                                <SelectItem value="last30days">Last 30 Days</SelectItem>
                                <SelectItem value="thisMonth">This Month</SelectItem>
                                <SelectItem value="lastMonth">Last Month</SelectItem>
                                <SelectItem value="custom">Custom Range</SelectItem>
                            </SelectContent>
                        </Select>

                        {dateRange === 'custom' && (
                            <div className="flex gap-2 flex-wrap">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <CalendarIcon className="w-4 h-4" />
                                            {customStartDate ? format(customStartDate, 'MMM d, yyyy') : 'Start date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={customStartDate}
                                            onSelect={setCustomStartDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <CalendarIcon className="w-4 h-4" />
                                            {customEndDate ? format(customEndDate, 'MMM d, yyyy') : 'End date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={customEndDate}
                                            onSelect={setCustomEndDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        )}
                    </div>

                    {/* Store Search */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Store Name</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search by store name..."
                                value={storeSearch}
                                onChange={(e) => setStoreSearch(e.target.value)}
                                className="pl-9"
                                list="store-suggestions"
                            />
                            <datalist id="store-suggestions">
                                {storeNames.map(name => (
                                    <option key={name} value={name} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Amount Range */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Amount (₪)</label>
                        <div className="flex gap-2 items-center">
                            <Input
                                type="number"
                                placeholder="Min"
                                value={minAmount}
                                onChange={(e) => setMinAmount(e.target.value)}
                                className="w-24"
                            />
                            <span className="text-gray-400">—</span>
                            <Input
                                type="number"
                                placeholder="Max"
                                value={maxAmount}
                                onChange={(e) => setMaxAmount(e.target.value)}
                                className="w-24"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}