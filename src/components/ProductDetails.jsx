import React, { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Leaf, AlertTriangle, Award, Globe } from 'lucide-react';

export default function ProductDetails({ product }) {
    const [expanded, setExpanded] = useState(false);

    const hasNutrition = product.nutritional_info && Object.keys(product.nutritional_info).length > 0;
    const hasIngredients = product.ingredients && product.ingredients.length > 0;
    const hasDetails = product.origin_country || product.certifications?.length > 0;

    if (!hasNutrition && !hasIngredients && !hasDetails) {
        return null;
    }

    return (
        <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Details
            </button>

            {expanded && (
                <div className="mt-3 space-y-3 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                    {/* Nutritional Info */}
                    {hasNutrition && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                <span className="text-yellow-600">🥗</span> Nutrition (per {product.nutritional_info.serving_size || 'serving'})
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                {product.nutritional_info.calories && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.calories}</span> cal
                                    </div>
                                )}
                                {product.nutritional_info.fat && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.fat}g</span> fat
                                    </div>
                                )}
                                {product.nutritional_info.sugar && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.sugar}g</span> sugar
                                    </div>
                                )}
                                {product.nutritional_info.protein && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.protein}g</span> protein
                                    </div>
                                )}
                                {product.nutritional_info.carbohydrates && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.carbohydrates}g</span> carbs
                                    </div>
                                )}
                                {product.nutritional_info.fiber && (
                                    <div className="text-gray-600 dark:text-gray-400">
                                        <span className="font-medium">{product.nutritional_info.fiber}g</span> fiber
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Ingredients */}
                    {hasIngredients && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Ingredients</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                {product.ingredients.join(', ')}
                            </p>
                        </div>
                    )}

                    {/* Allergens */}
                    {product.allergen_tags?.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                Allergens
                            </h4>
                            <div className="flex flex-wrap gap-1">
                                {product.allergen_tags.map(allergen => (
                                    <Badge key={allergen} variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                                        {allergen}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Origin & Certifications */}
                    <div className="flex flex-col gap-2">
                        {product.origin_country && (
                            <div className="flex items-center gap-2 text-xs">
                                <Globe className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-gray-600 dark:text-gray-400">Origin: <span className="font-medium">{product.origin_country}</span></span>
                            </div>
                        )}

                        {product.certifications?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {product.certifications.map(cert => (
                                    <Badge key={cert} variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                                        <Award className="w-2.5 h-2.5 mr-0.5 inline" />
                                        {cert}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}