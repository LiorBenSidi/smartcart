import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Play, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

export default function SystemValidationPanel() {
    const [latestResult, setLatestResult] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [expandedModule, setExpandedModule] = useState(null);

    const fetchLatest = async () => {
        try {
            const results = await base44.entities.SystemValidationResult.list('-run_at', 1);
            if (results.length > 0) {
                setLatestResult(results[0]);
            }
        } catch (e) {
            console.error("Failed to load validation results", e);
        }
    };

    useEffect(() => {
        fetchLatest();
    }, []);

    const runValidation = async () => {
        setIsRunning(true);
        try {
            await base44.functions.invoke('runSystemValidation');
            await fetchLatest();
        } catch (e) {
            console.error("Validation failed to run", e);
        } finally {
            setIsRunning(false);
        }
    };

    const getStatusIcon = (status) => {
        if (status === 'PASS') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
        if (status === 'FAIL') return <XCircle className="w-5 h-5 text-red-500" />;
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    };

    const getStatusColor = (status) => {
        if (status === 'PASS') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (status === 'FAIL') return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-amber-100 text-amber-700 border-amber-200';
    };

    const modules = [
        { key: 'wave0', label: 'Wave 0: Data Trust' },
        { key: 'wave1', label: 'Wave 1: Intelligence' },
        { key: 'wave2', label: 'Wave 2: Economic Core' },
        { key: 'timeBased', label: 'Time-Based Cart' }
    ];

    if (!latestResult && !isRunning) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">System Validation</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-6 text-gray-500">
                        No validation reports found.
                        <div className="mt-4">
                            <Button onClick={runValidation}>Run First Validation</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 border-b border-gray-100 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            System Validation
                            {latestResult && (
                                <Badge variant="outline" className={getStatusColor(latestResult.status)}>
                                    {latestResult.status}
                                </Badge>
                            )}
                        </CardTitle>
                        {latestResult && (
                            <p className="text-xs text-gray-500 mt-1">
                                Last run: {format(new Date(latestResult.run_at), 'PPP p')}
                            </p>
                        )}
                    </div>
                    <Button 
                        size="sm" 
                        onClick={runValidation} 
                        disabled={isRunning}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                        Run Validation
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {latestResult && latestResult.results ? (
                    <div className="divide-y divide-gray-100">
                        {modules.map((mod) => {
                            const result = latestResult.results[mod.key];
                            const isFail = result?.status === 'FAIL';
                            const failureCount = result?.failures?.length || 0;
                            
                            return (
                                <div key={mod.key} className="bg-white">
                                    <div 
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => setExpandedModule(expandedModule === mod.key ? null : mod.key)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(result?.status || 'PASS')}
                                            <div>
                                                <p className="font-medium text-sm text-gray-900">{mod.label}</p>
                                                {isFail && (
                                                    <p className="text-xs text-red-600 font-medium">
                                                        {failureCount} assertion failure{failureCount !== 1 ? 's' : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {failureCount > 0 ? (
                                            expandedModule === mod.key ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                                        ) : (
                                            <span className="text-xs text-gray-400">OK</span>
                                        )}
                                    </div>
                                    
                                    {expandedModule === mod.key && result?.failures?.length > 0 && (
                                        <div className="bg-red-50/50 p-4 border-t border-gray-100 text-xs text-red-800 space-y-2">
                                            {result.failures.map((fail, idx) => (
                                                <div key={idx} className="flex gap-2 items-start">
                                                    <span className="font-mono bg-red-100 px-1 rounded text-[10px] mt-0.5">FAIL</span>
                                                    <div className="flex-1">
                                                        {fail.message}
                                                        {fail.entityId && (
                                                            <span className="block text-red-500 text-[10px] font-mono mt-0.5">ID: {fail.entityId}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-6 text-center text-gray-500">
                        {isRunning ? 'Running validation suite...' : 'No details available.'}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}