import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

export default function PriceComparisonReview({ comparisonResults, onConfirm, onCancel, isUpdating }) {
  const [selections, setSelections] = useState({});

  const differencesOnly = comparisonResults.filter(r => r.status === 'price_difference');
  const notFoundItems = comparisonResults.filter(r => r.status === 'not_found' || r.status === 'no_code');
  const matchedItems = comparisonResults.filter(r => r.status === 'match');

  const toggleSelection = (index, choice) => {
    setSelections({ ...selections, [index]: choice });
  };

  const handleConfirm = () => {
    const updates = differencesOnly
      .filter((_, idx) => selections[idx] === 'receipt')
      .map(r => ({
        productPriceId: r.catalogPrice.id,
        newPrice: r.receiptPrice
      }));
    onConfirm(updates);
  };

  return (
    <div className="space-y-6 pb-20 max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Price Comparison Results</h2>
        <p className="text-sm text-gray-600">Review differences between receipt and catalog prices</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{matchedItems.length}</div>
            <div className="text-xs text-gray-500">Matched</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-amber-200">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 text-amber-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{differencesOnly.length}</div>
            <div className="text-xs text-gray-500">Differences</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-red-200">
          <CardContent className="p-4 text-center">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-gray-900">{notFoundItems.length}</div>
            <div className="text-xs text-gray-500">Not Found</div>
          </CardContent>
        </Card>
      </div>

      {/* Price Differences */}
      {differencesOnly.length > 0 && (
        <Card className="shadow-sm border-amber-200">
          <CardHeader className="bg-amber-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              Price Differences Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {differencesOnly.map((result, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">{result.item.name}</div>
                    <div className="text-xs text-gray-500">Code: {result.item.code}</div>
                  </div>
                  <div className={`text-sm font-bold ${result.receiptPrice > result.dbPrice ? 'text-red-600' : 'text-green-600'}`}>
                    {result.receiptPrice > result.dbPrice ? '+' : '-'}${Math.abs(result.difference).toFixed(2)}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleSelection(idx, 'db')}
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      selections[idx] === 'db'
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs text-gray-500 mb-1">Catalog Price</div>
                    <div className="font-bold text-gray-900">${result.dbPrice.toFixed(2)}</div>
                  </button>
                  <button
                    onClick={() => toggleSelection(idx, 'receipt')}
                    className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                      selections[idx] === 'receipt'
                        ? 'border-green-600 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs text-gray-500 mb-1">Receipt Price</div>
                    <div className="font-bold text-gray-900">${result.receiptPrice.toFixed(2)}</div>
                  </button>
                </div>

                {!selections[idx] && (
                  <p className="text-xs text-amber-600 text-center">⚠️ Choose which price to keep</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Not Found Items */}
      {notFoundItems.length > 0 && (
        <Card className="shadow-sm border-red-200">
          <CardHeader className="bg-red-50">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Items Not Found in Catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {notFoundItems.map((result, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{result.item.name}</div>
                  <div className="text-xs text-gray-500">{result.message}</div>
                </div>
                <div className="text-sm text-gray-600">${(result.item.price || 0).toFixed(2)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isUpdating}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isUpdating || (differencesOnly.length > 0 && Object.keys(selections).length < differencesOnly.length)}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isUpdating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</>
          ) : (
            `Confirm & Continue`
          )}
        </Button>
      </div>

      {differencesOnly.length > 0 && Object.keys(selections).length < differencesOnly.length && (
        <p className="text-center text-sm text-amber-600">
          Please select a price for all differences before continuing
        </p>
      )}
    </div>
  );
}