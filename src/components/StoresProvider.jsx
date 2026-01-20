import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const StoresContext = createContext();

export const useStores = () => {
    const context = useContext(StoresContext);
    if (!context) {
        throw new Error('useStores must be used within a StoresProvider');
    }
    return context;
};

export const StoresProvider = ({ children }) => {
    const [stores, setStores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [userLocation, setUserLocation] = useState(null);
    
    // Weights state
    const [distanceWeight, setDistanceWeight] = useState(50);
    const [ratingWeight, setRatingWeight] = useState(30);
    const [sentimentWeight, setSentimentWeight] = useState(20);

    const fetchStores = async (latitude, longitude, overrideWeights = {}) => {
        try {
            setLoading(true);
            setError(null);
            
            // Use provided weights or current state
            const dWeight = overrideWeights.distanceWeight ?? distanceWeight;
            const rWeight = overrideWeights.ratingWeight ?? ratingWeight;
            const sWeight = overrideWeights.sentimentWeight ?? sentimentWeight;

            // Update state if overrides provided
            if (overrideWeights.distanceWeight !== undefined) setDistanceWeight(dWeight);
            if (overrideWeights.ratingWeight !== undefined) setRatingWeight(rWeight);
            if (overrideWeights.sentimentWeight !== undefined) setSentimentWeight(sWeight);

            let batch = 0;
            let hasMore = true;
            let allStores = [];

            while (hasMore) {
                const response = await base44.functions.invoke('getNearbyStores', {
                    latitude,
                    longitude,
                    distanceWeight: dWeight,
                    ratingWeight: rWeight,
                    sentimentWeight: sWeight,
                    batch
                });

                const newStores = response.data.nearbyStores || [];
                allStores = [...allStores, ...newStores];
                
                // Update stores progressively
                setStores(prev => {
                    // Create a map of existing stores by id to merge/avoid duplicates if needed
                    // But here we're appending batches. 
                    // However, if we want to show progress, we might want to replace the whole list 
                    // or append. Since the backend returns sorted batches, appending is safe 
                    // assuming we reset first (which we do in getUserLocation).
                    // Actually, in the loop, we accumulate in local `allStores`. 
                    // To show updates live, we should update state.
                    // But we must be careful not to duplicate if re-renders happen.
                    // Simple approach: setStores(current accumulated)
                    return [...allStores];
                });

                hasMore = response.data.hasMore;
                batch++;
                setProgress(Math.min((batch / 5) * 100, 95));
            }

            setProgress(100);
            setStores(allStores);
            localStorage.setItem('cached_stores', JSON.stringify(allStores));

        } catch (err) {
            console.error("Fetch stores error", err);
            setError('Failed to fetch stores: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const getUserLocation = (forceRefresh = false) => {
        // If already loading, don't trigger again unless forced? 
        // Or maybe user wants to restart.
        
        setLoading(true);
        setError(null);
        
        // Check cache for both location and stores
        const cachedLocation = localStorage.getItem('user_location');
        const cachedStores = localStorage.getItem('cached_stores');

        if (!forceRefresh && cachedLocation) {
            try {
                const { lat, lon } = JSON.parse(cachedLocation);
                setUserLocation([lat, lon]);
                
                if (cachedStores) {
                    const stores = JSON.parse(cachedStores);
                    if (stores.length > 0) {
                        setStores(stores);
                        setLoading(false);
                        setProgress(100);
                        return;
                    }
                }
                
                // If location cached but no stores, fetch them
                setStores([]);
                setProgress(0);
                fetchStores(lat, lon);
                return;
            } catch (e) {
                console.error("Error parsing cached data", e);
            }
        }

        // Only reset if we are actually going to fetch new data
        setStores([]);
        setProgress(0);

        if (!navigator.geolocation) {
            setError('Geolocation is not supported');
            setLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation([latitude, longitude]);
                localStorage.setItem('user_location', JSON.stringify({ lat: latitude, lon: longitude }));
                fetchStores(latitude, longitude);
            },
            async (err) => {
                console.warn("Geolocation error", err);
                // Fallback location (Tel Aviv)
                const latitude = 32.0853;
                const longitude = 34.7818;
                setUserLocation([latitude, longitude]); // Set fallback as location
                fetchStores(latitude, longitude);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // Initial load handled by the Page usually, but we can do it here if we want auto-load on app start.
    // However, the prompt implies "Stores page" behavior. 
    // We'll expose `getUserLocation` and let the page call it on mount if needed, 
    // but check if data exists first.

    return (
        <StoresContext.Provider value={{
            stores,
            loading,
            error,
            progress,
            userLocation,
            distanceWeight,
            ratingWeight,
            sentimentWeight,
            setDistanceWeight,
            setRatingWeight,
            setSentimentWeight,
            getUserLocation,
            fetchStores
        }}>
            {children}
        </StoresContext.Provider>
    );
};