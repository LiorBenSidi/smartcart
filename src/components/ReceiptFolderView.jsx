import React from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronRight, ShoppingBag, Folder, Calendar, Loader2, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function ReceiptFolderView({ receipts, onDelete }) {
    if (!receipts || receipts.length === 0) {
        return (
            <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <ShoppingBag className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No receipts found.</p>
            </div>
        );
    }

    // Group receipts by Year -> Month while preserving original order
    const grouped = receipts.reduce((acc, receipt, index) => {
        const date = new Date(receipt.date);
        const year = format(date, 'yyyy');
        // Use month index for sorting, display name for rendering
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
            <Accordion type="multiple" className="w-full space-y-2">
                {years.map(year => (
                    <AccordionItem key={year} value={year} className="border-b-0 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 px-1">
                        <AccordionTrigger className="hover:no-underline py-3 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                                    <Folder className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <span className="font-bold text-gray-900 dark:text-gray-100">{year}</span>
                                <span className="text-xs text-gray-400 font-normal ml-auto mr-2">
                                    {Object.values(grouped[year]).reduce((acc, m) => acc + m.items.length, 0)} receipts
                                </span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pl-4 pr-1 pt-1 pb-2">
                            <Accordion type="multiple" className="w-full space-y-1">
                                {Object.keys(grouped[year])
                                    .sort((a, b) => b - a) // Sort months descending (12, 11, ...)
                                    .map(monthKey => {
                                        const { name: monthName, items } = grouped[year][monthKey];
                                        return (
                                            <AccordionItem key={monthKey} value={`${year}-${monthKey}`} className="border-b-0">
                                                <AccordionTrigger className="hover:no-underline py-2 px-3 rounded-lg text-sm group hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <div className="flex items-center gap-3">
                                                        <Calendar className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                                        <span className="text-gray-700 dark:text-gray-300 font-medium">{monthName}</span>
                                                        <span className="text-xs text-gray-400 font-normal ml-auto mr-2">
                                                            {items.length} items
                                                        </span>
                                                    </div>
                                                </AccordionTrigger>
                                                <AccordionContent className="pl-4 pt-2 pb-2">
                                                    <div className="space-y-2">
                                                        {items.map(receipt => {
                                                            const isPending = receipt.processingStatus === 'pending';
                                                            const isFailed = receipt.processingStatus === 'failed';
                                                            return (
                                                                <Link key={receipt.id} to={`${createPageUrl('Receipt')}?id=${receipt.id}`} className="block">
                                                                    <div className={`p-3 rounded-lg border flex items-center justify-between hover:shadow-sm transition-all bg-white dark:bg-gray-800/50 ${
                                                                        isPending ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/30' : 
                                                                        isFailed ? 'border-red-200 dark:border-red-800 bg-red-50/30' : 
                                                                        'border-gray-100 dark:border-gray-700'
                                                                    }`}>
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                                                                                isPending ? 'bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200' :
                                                                                isFailed ? 'bg-red-100 dark:bg-red-900/30 border-red-200' :
                                                                                'bg-gray-50 dark:bg-gray-700 border-gray-100 dark:border-gray-600'
                                                                            }`}>
                                                                                {isPending ? (
                                                                                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                                                                ) : isFailed ? (
                                                                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                                                                ) : (
                                                                                    <ShoppingBag className="w-4 h-4 text-gray-500" />
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                                                                                    {isPending ? 'Processing...' : receipt.storeName}
                                                                                </h4>
                                                                                <p className="text-[10px] text-gray-500">
                                                                                    {format(new Date(receipt.date), 'MMM d, yyyy')}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {!isPending && !isFailed && (
                                                                                <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">₪{receipt.totalAmount?.toFixed(2)}</span>
                                                                            )}
                                                                            {onDelete && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        onDelete(receipt.id);
                                                                                    }}
                                                                                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                                    title="Delete receipt"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                            <ChevronRight className="w-3 h-3 text-gray-300" />
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