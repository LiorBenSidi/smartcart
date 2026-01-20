import React from 'react';
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Filter, X } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

export default function RecommendationFilters({ 
    filters, 
    setFilters, 
    availableBrands = [], 
    availableStores = [], 
    priceRange = { min: 0, max: 100 },
    className 
}) {
    const handleDietaryChange = (tag) => {
        setFilters(prev => {
            const current = prev.dietary || [];
            if (current.includes(tag)) {
                return { ...prev, dietary: current.filter(t => t !== tag) };
            } else {
                return { ...prev, dietary: [...current, tag] };
            }
        });
    };

    const handleBrandChange = (brand) => {
        setFilters(prev => {
            const current = prev.brands || [];
            if (current.includes(brand)) {
                return { ...prev, brands: current.filter(b => b !== brand) };
            } else {
                return { ...prev, brands: [...current, brand] };
            }
        });
    };
    
    const handleStoreChange = (store) => {
        setFilters(prev => {
            const current = prev.stores || [];
            if (current.includes(store)) {
                return { ...prev, stores: current.filter(s => s !== store) };
            } else {
                return { ...prev, stores: [...current, store] };
            }
        });
    };

    const activeFilterCount = (filters.dietary?.length || 0) + (filters.brands?.length || 0) + (filters.stores?.length || 0) + (filters.priceRange ? 1 : 0);

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" className={`gap-2 ${className}`}>
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && 
                        <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {activeFilterCount}
                        </span>
                    }
                </Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>Filter Recommendations</SheetTitle>
                    <SheetDescription>
                        Narrow down your results based on your preferences.
                    </SheetDescription>
                </SheetHeader>
                
                <div className="py-6 space-y-6">
                    {/* Price Range */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label>Price Range</Label>
                            <span className="text-sm text-gray-500 font-medium">
                                ${filters.priceRange?.[0] ?? priceRange.min} - ${filters.priceRange?.[1] ?? priceRange.max}
                            </span>
                        </div>
                        <Slider
                            defaultValue={[priceRange.min, priceRange.max]}
                            value={filters.priceRange || [priceRange.min, priceRange.max]}
                            min={priceRange.min}
                            max={priceRange.max}
                            step={1}
                            onValueChange={(val) => setFilters(prev => ({ ...prev, priceRange: val }))}
                        />
                    </div>

                    {/* Dietary Attributes */}
                    <div className="space-y-3">
                        <Label>Dietary Attributes</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {['Vegan', 'Gluten Free', 'Organic', 'Kosher'].map(tag => (
                                <div key={tag} className="flex items-center space-x-2">
                                    <Checkbox 
                                        id={`diet-${tag}`} 
                                        checked={filters.dietary?.includes(tag)}
                                        onCheckedChange={() => handleDietaryChange(tag)}
                                    />
                                    <Label htmlFor={`diet-${tag}`} className="text-sm font-normal cursor-pointer text-gray-600 dark:text-gray-300">
                                        {tag}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stores */}
                    {availableStores.length > 0 && (
                        <div className="space-y-3">
                            <Label>Store Availability</Label>
                            <div className="space-y-2">
                                {availableStores.map(store => (
                                    <div key={store} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`store-${store}`} 
                                            checked={filters.stores?.includes(store)}
                                            onCheckedChange={() => handleStoreChange(store)}
                                        />
                                        <Label htmlFor={`store-${store}`} className="text-sm font-normal cursor-pointer text-gray-600 dark:text-gray-300">
                                            {store}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Brands */}
                    {availableBrands.length > 0 && (
                        <div className="space-y-3">
                            <Label>Brands</Label>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                {availableBrands.map(brand => (
                                    <div key={brand} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`brand-${brand}`} 
                                            checked={filters.brands?.includes(brand)}
                                            onCheckedChange={() => handleBrandChange(brand)}
                                        />
                                        <Label htmlFor={`brand-${brand}`} className="text-sm font-normal cursor-pointer text-gray-600 dark:text-gray-300">
                                            {brand}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setFilters({})}
                    >
                        <X className="w-4 h-4 mr-2" /> Clear All Filters
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}