import React from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, ShoppingBag, Folder, Calendar, Loader2, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function ReceiptFolderView({ receipts, onDelete }) {
    // Determine current year for default expansion
    const currentYear = new Date().getFullYear().toString();
    
    if (!receipts || receipts.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-dashed border-gray-700">
                <ShoppingBag className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No receipts found</p>
                <p className="text-gray-600 text-xs mt-1">Upload your first receipt above</p>
            </div>
        );
    }

    // Group receipts by Year -> Month while preserving original order
    const grouped = receipts.reduce((acc, receipt, index) => {
        const date = new Date(receipt.date);
        const year = format(date, 'yyyy');
        const monthKey = format(date, 'MM'); 
        const monthName = format(date, 'MMMM');
        
        if (!acc[year]) acc[year] = { months: {}, firstIndex: index };
        if (!acc[year].months[monthKey]) acc[year].months[monthKey] = { name: monthName, items: [], firstIndex: index };
        
        acc[year].months[monthKey].items.push(receipt);
        return acc;
    }, {});

    // Sort years by first appearance (preserves filter sort order)
    const years = Object.keys(grouped).sort((a, b) => grouped[a].firstIndex - grouped[b].firstIndex);

    return (
        <div className="space-y-2">
            <Accordion type="multiple" defaultValue={[currentYear]} className="w-full space-y-2">
                {years.map(year => (
                    <AccordionItem key={year} value={year} className="border-b-0 bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
                        <AccordionTrigger className="hover:no-underline py-3 px-4 hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center gap-3 w-full">
                                <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                                    <Folder className="w-4 h-4 text-indigo-400" />
                                </div>
                                <span className="font-semibold text-gray-200">{year}</span>
                                <span className="text-[10px] text-gray-500 font-normal ml-auto mr-2">
                                    {Object.values(grouped[year].months).reduce((acc, m) => acc + m.items.length, 0)}
                                </span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-2 pb-2">
                            <Accordion type="multiple" defaultValue={[`${year}-${Object.keys(grouped[year].months)[0]}`]} className="w-full space-y-1">
                                {Object.keys(grouped[year].months)
                                    .sort((a, b) => grouped[year].months[a].firstIndex - grouped[year].months[b].firstIndex)
                                    .map(monthKey => {
                                        const { name: monthName, items } = grouped[year].months[monthKey];
                                        return (
                                            <AccordionItem key={monthKey} value={`${year}-${monthKey}`} className="border-b-0">
                                                <AccordionTrigger className="hover:no-underline py-2 px-3 rounded-lg text-sm group hover:bg-gray-800/50 transition-colors">
                                                    <div className="flex items-center gap-3 w-full">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-400 transition-colors" />
                                                        <span className="text-gray-300 font-medium text-sm">{monthName}</span>
                                                        <span className="text-[10px] text-gray-600 font-normal ml-auto mr-2">
                                                            {items.length}
                                                        </span>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="pl-2 pt-1 pb-1">
                                                    <div className="space-y-1">
                                                        {items.map(receipt => {
                                                            const isPending = receipt.processingStatus === 'pending';
                                                            const isFailed = receipt.processingStatus === 'failed';
                                                            return (
                                                                <Link key={receipt.id} to={`${createPageUrl('Receipt')}?id=${receipt.id}`} className="block">
                                                                    <div className={`p-3 rounded-lg border flex items-center justify-between hover:bg-gray-800/70 transition-all ${
                                                                        isPending ? 'border-indigo-800/50 bg-indigo-900/20' : 
                                                                        isFailed ? 'border-red-800/50 bg-red-900/20' : 
                                                                        'border-gray-700/50 bg-gray-800/30'
                                                                    }`}>
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                                                isPending ? 'bg-indigo-500/20' :
                                                                                isFailed ? 'bg-red-500/20' :
                                                                                'bg-gray-700/50'
                                                                            }`}>
                                                                                {isPending ? (
                                                                                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                                                                                ) : isFailed ? (
                                                                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                                                                ) : (
                                                                                    <ShoppingBag className="w-4 h-4 text-gray-500" />
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="font-medium text-gray-200 text-sm" dir="auto">
                                                                                    {isPending ? 'Processing...' : receipt.storeName}
                                                                                </h4>
                                                                                <p className="text-[10px] text-gray-500">
                                                                                    {format(new Date(receipt.date), 'MMM d')}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {!isPending && !isFailed && (
                                                                                <span className="font-semibold text-gray-200 text-sm">₪{receipt.totalAmount?.toFixed(0)}</span>
                                                                            )}
                                                                            {onDelete && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        onDelete(receipt.id);
                                                                                    }}
                                                                                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                                                                                    title="Delete"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            )}
                                                                            <ChevronRight className="w-3 h-3 text-gray-600" />
                                                                        </div>
                                                                    </div>
                                                                </Link>
                                                            );
                                                        })}
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        );
                                    })}
                            </Accordion>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}