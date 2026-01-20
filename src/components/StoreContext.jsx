import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const StoreContext = createContext();

export function useStore() {
  return useContext(StoreContext);
}

export function StoreProvider({ children }) {
  const [stores, setStores] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  
  // Weights state
  const [distanceWeight, setDistanceWeight] = useState(0.5);
  const [ratingWeight, setRatingWeight] = useState(0.25);
  const [sentimentWeight, setSentimentWeight] = useState(0.25);

  // Initialize from cache on mount
  useEffect(() => {
    const cachedLocation = localStorage.getItem('user_location');
    const cachedStores = localStorage.getItem('cached_stores');
    
    if (cachedLocation) {
      try {
        const { lat, lon } = JSON.parse(cachedLocation);
        setUserLocation([lat, lon]);
      } catch (e) {
        console.error("Error parsing cached location", e);
      }
    }
    
    if (cachedStores) {
      try {
        const parsedStores = JSON.parse(cachedStores);
        if (parsedStores.length > 0) {
          setStores(parsedStores);
        }
      } catch (e) {
        console.error("Error parsing cached stores", e);
      }
    }
  }, []);

  const fetchStores = async (latitude, longitude) => {
    try {
      let batch = 0;
      let hasMore = true;
      let allStores = [];
      
      while (hasMore) {
         const response = await base44.functions.invoke('getNearbyStores', { 
          latitude, 
          longitude,
          distanceWeight,
          ratingWeight,
          sentimentWeight,
          batch
        });
        
        const newStores = response.data.nearbyStores || [];
        allStores = [...allStores, ...newStores];
        setStores(allStores);
        
        hasMore = response.data.hasMore;
        batch++;
        setProgress(Math.min((batch / 5) * 100, 95));
      }
      
      setProgress(100);
      setStores(allStores);
      localStorage.setItem('cached_stores', JSON.stringify(allStores));

    } catch (err) {
      setError('Failed to fetch stores: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getUserLocation = (forceRefresh = false) => {
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
          // Fallback location
          const latitude = 32.0853;
          const longitude = 34.7818;
          fetchStores(latitude, longitude);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  
  const refreshStores = () => {
    getUserLocation(true);
  };

  // Trigger fetch if weights change and we have a location
  useEffect(() => {
    if (userLocation && !loading) {
       // We don't auto-refresh on weight change to avoid too many requests
       // But if we wanted to, we would call fetchStores(userLocation[0], userLocation[1]) here
       // For now, let's stick to manual refresh or initial load
    }
  }, [distanceWeight, ratingWeight, sentimentWeight]);

  const value = {
    stores,
    userLocation,
    loading,
    error,
    progress,
    refreshStores,
    distanceWeight,
    setDistanceWeight,
    ratingWeight,
    setRatingWeight,
    sentimentWeight,
    setSentimentWeight
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}