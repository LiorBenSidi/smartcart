import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { MapPin, Navigation, Star, Phone, Clock, Loader2, AlertCircle, Target, Car, Bus, Layers, ChevronDown, ChevronUp, Trophy, Medal, MessageSquare, Flag, HelpCircle, Settings } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import StoreReviews from '@/components/StoreReviews';
import DataCorrectionDialog from '@/components/DataCorrectionDialog';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

// Custom Icons
const UserIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Map Controller
function MapController({ center, bounds, selectedStore }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [50, 50] });else
    if (center) map.setView(center, 14);
  }, [center, bounds, map]);

  useEffect(() => {
    if (selectedStore) map.setView([selectedStore.latitude, selectedStore.longitude], 16, { animate: true });
  }, [selectedStore, map]);

  return null;
}

import { Progress } from "@/components/ui/progress";

export default function NearbyStores() {
  const [stores, setStores] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(''); // 'scanning' | 'routing'
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [expandedChain, setExpandedChain] = useState(null);
  const [distanceWeight, setDistanceWeight] = useState(0.5);
  const [ratingWeight, setRatingWeight] = useState(0.25);
  const [sentimentWeight, setSentimentWeight] = useState(0.25);

  const fetchStoresWithProgress = async (lat, lon) => {
      setLoading(true);
      setStores([]);
      setProgress(0);
      setLoadingStage('scanning');

      try {
          // 1. Scan Stores (Batch Fetch)
          let allStores = [];
          let batch = 0;
          let hasMore = true;

          while (hasMore) {
              const res = await base44.functions.invoke('getNearbyStores', {
                  latitude: lat,
                  longitude: lon,
                  batch
              });
              
              if (res.data.error) throw new Error(res.data.error);

              const newStores = res.data.stores || [];
              allStores = [...allStores, ...newStores];
              setStores(prev => [...prev, ...newStores]); // Incremental update
              
              hasMore = res.data.hasMore;
              batch++;
              
              // Estimate progress (just a visual indicator since we don't know total)
              // Assuming ~20 batches max for typical area
              setProgress(Math.min((batch / 10) * 100, 90));
          }

          // 2. Sort by Haversine Distance (Top 15 for routing)
          allStores.sort((a, b) => a.distance - b.distance);
          const top15 = allStores.slice(0, 15);
          const others = allStores.slice(15);

          // 3. Enrich Top 15 with Routes
          setLoadingStage('routing');
          setProgress(0);
          
          const enrichedTop15 = [];
          let completed = 0;

          // Process in parallel with concurrency limit or just sequential for progress bar effect
          for (const store of top15) {
              try {
                  const routeRes = await base44.functions.invoke('getRoute', {
                      origin: { lat, lon },
                      destination: { lat: store.latitude, lon: store.longitude },
                      mode: 'driving'
                  });

                  if (routeRes.data?.duration) {
                      store.rawDuration = routeRes.data.duration;
                      store.usingRouteDuration = true;
                      
                      const minutes = Math.round(store.rawDuration / 60);
                      const durationText = minutes > 60 
                          ? `${Math.floor(minutes/60)} hr ${minutes%60} min` 
                          : `${minutes} min`;
                      
                      store.drivingInfo = {
                          duration: durationText,
                          rawDuration: store.rawDuration
                      };
                  }
              } catch (e) {
                  console.warn("Routing failed for", store.name);
              }
              
              enrichedTop15.push(store);
              completed++;
              setProgress((completed / 15) * 100);
          }

          setStores([...enrichedTop15, ...others]);

      } catch (err) {
          setError('Failed to fetch stores: ' + err.message);
      } finally {
          setLoading(false);
          setLoadingStage('');
      }
  };

  const getUserLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        fetchStoresWithProgress(latitude, longitude);
      },
      (err) => {
        // Default to Tel Aviv
        const defLat = 32.0853;
        const defLon = 34.7818;
        setUserLocation([defLat, defLon]);
        fetchStoresWithProgress(defLat, defLon);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {getUserLocation();}, []);

  // Constants
  const CHAIN_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
  '#6366F1', '#84CC16', '#14B8A6', '#F97316', '#06B6D4', '#D946EF'];


  const getChainColor = (chainId) => {
    if (!chainId) return '#6b7280';
    let hash = 0;
    for (let i = 0; i < chainId.length; i++) hash = chainId.charCodeAt(i) + ((hash << 5) - hash);
    return CHAIN_COLORS[Math.abs(hash) % CHAIN_COLORS.length];
  };

  const createMarkerIcon = (store, isClosest) => {
    const color = getChainColor(store.chain_id);
    const size = isClosest ? 48 : 32;

    if (store.chain_logo) {
      const html = `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="
                    width: ${size}px; 
                    height: ${size}px; 
                    background-color: white; 
                    border-radius: 50%; 
                    border: 2px solid ${isClosest ? '#FCD34D' : color}; 
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    overflow: hidden;
                    position: relative;
                ">
                    <img src="${store.chain_logo}" style="width: 80%; height: 80%; object-fit: contain;" />
                </div>
                <div style="
                    width: 0; 
                    height: 0; 
                    border-left: 6px solid transparent; 
                    border-right: 6px solid transparent; 
                    border-top: 8px solid ${isClosest ? '#FCD34D' : color}; 
                    margin-top: -1px;
                "></div>
                ${isClosest ? `<div style="margin-top: -${size + 15}px; background: #F59E0B; color: white; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">Closest</div>` : ''}
            </div>
          `;

      return L.divIcon({
        className: 'custom-logo-marker',
        html: html,
        iconSize: [size, size + 10],
        iconAnchor: [size / 2, size + 8],
        popupAnchor: [0, -size]
      });
    }

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
          <path fill="${color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="8" r="3.5" fill="white"/>
          ${isClosest ? `<circle cx="12" cy="8" r="1.5" fill="${color}"/><path d="M12 -4 L12 -12" stroke="${color}" stroke-width="2" />` : ''}
        </svg>
      `;
    return L.divIcon({
      className: 'custom-marker-icon',
      html: svg,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size]
    });
  };

  const openDirections = async (store) => {
    if (userLocation) {
      setCalculatingRoute(true);
      try {
        const res = await base44.functions.invoke('getRoute', {
          origin: { lat: userLocation[0], lon: userLocation[1] },
          destination: { lat: store.latitude, lon: store.longitude },
          mode: 'driving'
        });
        if (res.data?.geometry) {
          setRouteGeometry(res.data.geometry.coordinates.map((c) => [c[1], c[0]]));
          setSelectedStore(store);
        }
      } catch (e) {console.error("Routing failed", e);} finally
      {setCalculatingRoute(false);}
    }
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation?.[0]}%2C${userLocation?.[1]}%3B${store.latitude}%2C${store.longitude}`;
    window.open(url, '_blank');
  };

  // Client-side Scoring Logic
  const scoredStores = useMemo(() => {
    if (!stores.length) return [];
    
    // Determine max values for normalization
    const maxDuration = Math.max(...stores.map(s => s.rawDuration || 0), 1);
    const maxDistance = Math.max(...stores.map(s => s.distance || 0), 1);

    return stores.map(store => {
      // 1. Distance Score
      let distanceScore;
      if (store.rawDuration) {
          distanceScore = 1 - (store.rawDuration / maxDuration);
      } else {
          distanceScore = 1 - (store.distance / maxDistance);
      }
      // Clamp 0-1
      distanceScore = Math.max(0, Math.min(1, distanceScore));

      // 2. Rating Score
      // Normalizing 0-5 stars to 0-1
      const ratingScore = (store.average_rating || 0) / 5;

      // 3. Sentiment Score
      let sentimentScore = 0.5; // Default neutral
      if (store.sentiment === 'positive') sentimentScore = 1;
      else if (store.sentiment === 'negative') sentimentScore = 0;

      // Weighted Sum
      const combinedScore = (
          distanceScore * distanceWeight +
          ratingScore * ratingWeight +
          sentimentScore * sentimentWeight
      ) * 100;

      // Penalty for no reviews
      const noReviewPenalty = (store.review_count === 0) ? -5 : 0;

      return {
          ...store,
          recommendationScore: combinedScore + noReviewPenalty,
          distanceScore,
          ratingScore,
          sentimentScore
      };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore);

  }, [stores, distanceWeight, ratingWeight, sentimentWeight]);

  // Grouping
  const { top3Stores, groupedChains } = useMemo(() => {
    if (!scoredStores.length) return { top3Stores: [], groupedChains: [] };

    const top3 = scoredStores.slice(0, 3);
    
    // Group by Chain
    const groups = scoredStores.reduce((acc, store) => {
      if (!acc[store.chain_id]) {
        acc[store.chain_id] = {
          id: store.chain_id,
          name: store.chain_name || 'Unknown Chain',
          color: getChainColor(store.chain_id),
          logo: store.chain_logo,
          stores: []
        };
      }
      acc[store.chain_id].stores.push(store);
      return acc;
    }, {});

    // Sort groups by name
    const sortedGroups = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));

    return { top3Stores: top3, groupedChains: sortedGroups };
  }, [stores, distanceWeight, ratingWeight, sentimentWeight]);

  const getBounds = () => {
    if (!userLocation && !stores.length) return null;
    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend(userLocation);
    stores.forEach((s) => bounds.extend([s.latitude, s.longitude]));
    return bounds;
  };

  // if (loading) ... removed, handled inline
  if (error) return <div className="text-center p-8 text-red-500 bg-red-50 rounded-lg">{error}<Button onClick={getUserLocation} className="mt-4 block mx-auto">Retry</Button></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Nearby Stores</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{stores.length} locations found</p>
           </div>
           <Dialog>
              <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                      <HelpCircle className="h-5 w-5 text-gray-400 hover:text-indigo-600" />
                  </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          Store Discovery - Technical Details
                      </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                      <div>
                          <h4 className="font-semibold mb-2">Process Overview:</h4>
                          <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
                              <li>Retrieve user's geolocation</li>
                              <li>Calculate distances to all stores in database</li>
                              <li>Fetch routing information for nearest stores</li>
                              <li>Rank and display results with navigation options</li>
                          </ol>
                      </div>
                      
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                          <h4 className="font-semibold mb-2 text-blue-900 dark:text-blue-200">Distance Calculation (Haversine):</h4>
                          <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">Calculates "as the crow flies" distance using latitude/longitude:</p>
                          <div className="bg-white dark:bg-gray-800 p-3 rounded text-xs font-mono">
                              <code className="text-gray-700 dark:text-gray-300">
                                  R = 6371 km (Earth radius)<br />
                                  Δφ = lat₂ - lat₁<br />
                                  Δλ = lon₂ - lon₁<br />
                                  a = sin²(Δφ/2) + cos(φ₁)⋅cos(φ₂)⋅sin²(Δλ/2)<br />
                                  c = 2⋅atan2(√a, √(1-a))<br />
                                  distance = R × c
                              </code>
                          </div>
                      </div>
                      
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                          <h4 className="font-semibold mb-2 text-green-900 dark:text-green-200">Driving Time Estimation (OSRM):</h4>
                          <div className="space-y-2 text-gray-700 dark:text-gray-300">
                              <p className="text-xs">Uses Open Source Routing Machine (OSRM) API for accurate distance ranking:</p>
                              <ul className="list-disc list-inside ml-4 text-xs space-y-1">
                                  <li><strong>Top 25 stores</strong> (by Haversine distance): Fetches actual road routes with real driving duration</li>
                                  <li><strong>Stores beyond top 25</strong>: Ranked by straight-line (Haversine) distance due to API rate limits</li>
                                  <li>Uses cached route data from RouteCache to reduce API calls</li>
                                  <li>Returns distance (meters) and duration (seconds) for routing calculations</li>
                                  <li>Provides route geometry for map visualization</li>
                                  <li>Stores ranked by actual driving time when available, falls back to Haversine distance otherwise</li>
                              </ul>
                              <p className="text-xs mt-2"><strong>Modes:</strong> driving (default), walking, cycling</p>
                          </div>
                      </div>
                      
                      <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
                          <h4 className="font-semibold mb-2 text-purple-900 dark:text-purple-200">Ranking Algorithm:</h4>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Weighted Scoring System (Default: 50% Distance, 25% Rating, 25% Sentiment):</p>
                          
                          <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300 ml-4">
                              <div>
                                  <strong>1. Distance Score (0-1):</strong>
                                  <p className="ml-4">Normalized based on maximum distance in search radius. Closer stores score higher.</p>
                              </div>
                              
                              <div>
                                  <strong>2. Rating Score (0-1):</strong>
                                  <p className="ml-4">Average user rating from StoreReview entities, normalized to 0-1 scale (5-star max).</p>
                              </div>
                              
                              <div>
                                  <strong>3. Sentiment Score (0-1):</strong>
                                  <p className="ml-4">AI-analyzed sentiment from StoreSentiment entities:
                                      <ul className="list-disc ml-6 mt-1">
                                          <li>Positive sentiment = 1.0</li>
                                          <li>Neutral sentiment = 0.5</li>
                                          <li>Negative sentiment = 0.0</li>
                                      </ul>
                                  </p>
                              </div>
                              
                              <div className="mt-2 bg-white dark:bg-gray-800 p-2 rounded">
                                  <strong>Final Score Calculation:</strong>
                                  <code className="block mt-1 text-xs">
                                      score = (distanceScore × distanceWeight + <br/>
                                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ratingScore × ratingWeight + <br/>
                                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;sentimentScore × sentimentWeight) × 100
                                  </code>
                              </div>
                              
                              <div>
                                  <strong>Penalty for Stores Without Reviews:</strong>
                                  <ul className="list-disc ml-6 mt-1">
                                      <li>Stores with no reviews: -5 points (always applied)</li>
                                  </ul>
                              </div>
                              </div>

                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-3"><strong>User Controls:</strong> Adjust weight sliders to prioritize distance, rating, or sentiment according to your preferences.</p>

                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Top 3 stores displayed in podium format. All stores grouped by chain and sorted alphabetically in accordion view.</p>
                      </div>
                      
                      <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded">
                          <h4 className="font-semibold mb-2">Map Visualization:</h4>
                          <p className="text-xs text-gray-700 dark:text-gray-300">Uses Leaflet + OpenStreetMap. Custom markers show chain logos, with gold highlight for closest store. Click any marker to view details and get directions.</p>
                      </div>
                  </div>
              </DialogContent>
           </Dialog>
        </div>
        </div>

        {/* Filter Weights */}
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
        <CardContent className="p-4 space-y-4">
         <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
           <Settings className="w-4 h-4" />
           Ranking Preferences
         </h3>

         <div className="space-y-3">
           <div>
             <div className="flex justify-between items-center mb-2">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Distance</label>
               <span className="text-sm text-gray-500 dark:text-gray-400">{(distanceWeight * 100).toFixed(0)}%</span>
             </div>
             <Slider
               value={[distanceWeight]}
               onValueChange={([val]) => {
                 setDistanceWeight(val);
                 const remaining = 1 - val;
                 const currentSum = ratingWeight + sentimentWeight;
                 if (currentSum > 0) {
                   setRatingWeight((ratingWeight / currentSum) * remaining);
                   setSentimentWeight((sentimentWeight / currentSum) * remaining);
                 }
               }}
               min={0}
               max={1}
               step={0.05}
               className="w-full"
             />
           </div>

           <div>
             <div className="flex justify-between items-center mb-2">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rating</label>
               <span className="text-sm text-gray-500 dark:text-gray-400">{(ratingWeight * 100).toFixed(0)}%</span>
             </div>
             <Slider
               value={[ratingWeight]}
               onValueChange={([val]) => {
                 setRatingWeight(val);
                 const remaining = 1 - val;
                 const currentSum = distanceWeight + sentimentWeight;
                 if (currentSum > 0) {
                   setDistanceWeight((distanceWeight / currentSum) * remaining);
                   setSentimentWeight((sentimentWeight / currentSum) * remaining);
                 }
               }}
               min={0}
               max={1}
               step={0.05}
               className="w-full"
             />
           </div>

           <div>
             <div className="flex justify-between items-center mb-2">
               <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sentiment</label>
               <span className="text-sm text-gray-500 dark:text-gray-400">{(sentimentWeight * 100).toFixed(0)}%</span>
             </div>
             <Slider
               value={[sentimentWeight]}
               onValueChange={([val]) => {
                 setSentimentWeight(val);
                 const remaining = 1 - val;
                 const currentSum = distanceWeight + ratingWeight;
                 if (currentSum > 0) {
                   setDistanceWeight((distanceWeight / currentSum) * remaining);
                   setRatingWeight((ratingWeight / currentSum) * remaining);
                 }
               }}
               min={0}
               max={1}
               step={0.05}
               className="w-full"
             />
           </div>

           <Button 
               onClick={getUserLocation} 
               className="w-full bg-green-600 hover:bg-green-700 text-white"
               disabled={loading}
           >
               {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Navigation className="w-4 h-4 mr-2" />} 
               Refresh
           </Button>

           <Button
             variant="outline"
             size="sm"
             onClick={() => {
               setDistanceWeight(0.5);
               setRatingWeight(0.25);
               setSentimentWeight(0.25);
             }}
             className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/50"
           >
             Reset to Defaults
           </Button>
           </div>
           </CardContent>
           </Card>

      {/* Top 3 Podium */}
      {loading ? 
        <Card className="p-8 text-center bg-slate-50 dark:bg-slate-900 border-dashed">
            <Loader2 className="w-8 h-8 mx-auto text-indigo-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                {loadingStage === 'scanning' ? 'Finding Stores...' : 'Calculating Routes...'}
            </h3>
            <div className="w-full max-w-xs mx-auto space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    {loadingStage === 'scanning' ? `${stores.length} found` : `${Math.round(progress)}% calculated`}
                </p>
            </div>
        </Card>
      : top3Stores.length > 0 &&
      <div className="grid grid-cols-3 gap-3">
              {top3Stores.map((store, idx) => {
          const medalColor = idx === 0 ? 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/40 dark:border-yellow-700 dark:text-yellow-200' :
          idx === 1 ? 'bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300' :
          'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/40 dark:border-orange-700 dark:text-orange-200';
          const iconColor = idx === 0 ? 'text-yellow-600 dark:text-yellow-400' : idx === 1 ? 'text-slate-500 dark:text-slate-400' : 'text-orange-600 dark:text-orange-400';

          return (
            <Card key={store.id} className={`relative overflow-hidden border-2 dark:bg-gray-800 ${idx === 0 ? 'border-yellow-400 shadow-md ring-1 ring-yellow-200 dark:border-yellow-600 dark:ring-yellow-900' : idx === 1 ? 'border-slate-300 dark:border-slate-600' : 'border-orange-300 dark:border-orange-600'} transition-all hover:scale-105 cursor-pointer`} onClick={() => setSelectedStore(store)}>
                          <div className={`absolute top-0 left-0 w-full h-1 ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-500'}`} />
                          <CardContent className="p-3 flex flex-col items-center text-center">
                              <Trophy className={`w-6 h-6 mb-2 ${iconColor}`} />
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 uppercase tracking-wide ${medalColor}`}>
                                  {idx === 0 ? '1st Place' : idx === 1 ? '2nd Place' : '3rd Place'}
                              </div>
                              <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate w-full">{store.name}</h3>
                              {store.average_rating > 0 &&
                              <div className="flex flex-col items-center mb-1">
                                      <div className="flex items-center gap-0.5 text-[10px] text-yellow-600 dark:text-yellow-400 font-bold">
                                          <Star className="w-3 h-3 fill-current" />
                                          {store.average_rating.toFixed(1)}/5
                                      </div>
                                      <span className="text-[9px] text-gray-400 dark:text-gray-500 font-normal">{store.review_count} reviews</span>
                                      {store.sentiment && (
                                          <span className={`text-[9px] font-medium mt-0.5 px-1.5 py-0.5 rounded ${
                                              store.sentiment === 'positive' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                              store.sentiment === 'negative' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                              'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                          }`}>
                                              {store.sentiment.charAt(0).toUpperCase() + store.sentiment.slice(1)} sentiment
                                          </span>
                                      )}
                                  </div>
                              }
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate w-full mb-2">{store.chain_name}</p>
                              <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                                  <Car className="w-3 h-3" />
                                  {store.drivingInfo?.duration || `${store.distance.toFixed(1)} km`}
                              </div>
                          </CardContent>
                      </Card>);

        })}
          </div>
      }

      {/* Map */}
      <Card className="overflow-hidden shadow-lg border-2 border-indigo-100 dark:border-indigo-900 h-[350px] relative z-0 dark:bg-gray-800">
         {typeof window !== 'undefined' &&
        <MapContainer center={userLocation || [32.0853, 34.7818]} zoom={12} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController center={userLocation} bounds={getBounds()} selectedStore={selectedStore} />
                {userLocation && <Marker position={userLocation} icon={UserIcon}><Popup>You</Popup></Marker>}
                {stores.map((store, idx) =>
          <Marker
            key={store.id}
            position={[store.latitude, store.longitude]}
            icon={createMarkerIcon(store, idx === 0)}
            eventHandlers={{ click: () => setSelectedStore(store) }}>

                        <Popup>
                            <div className="p-1 min-w-[200px]">
                                <div className="mb-1">
                                    <h4 className="font-bold text-sm">{store.name}</h4>
                                    {store.average_rating > 0 &&
                                <div className="mt-1 space-y-1">
                                            <div className="flex items-center text-xs text-yellow-600 font-bold">
                                                <Star className="w-3 h-3 fill-current mr-0.5" />
                                                {store.average_rating.toFixed(1)}/5
                                            </div>
                                            <div className="text-[10px] text-gray-400">{store.review_count} reviews</div>
                                            {store.sentiment && (
                                                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded inline-block ${
                                                    store.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                                                    store.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {store.sentiment.charAt(0).toUpperCase() + store.sentiment.slice(1)} sentiment
                                                </span>
                                            )}
                                        </div>
                                }
                                </div>
                                <p className="text-xs text-gray-600 mb-2">{store.address_line}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" className="h-7 text-xs bg-indigo-600" onClick={() => openDirections(store)}>Navigate</Button>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="bg-background text-slate-50 px-3 text-xs font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground h-7">Reviews</Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>Reviews for {store.name}</DialogTitle>
                                            </DialogHeader>
                                            <StoreReviews storeId={store.id} storeName={store.name} />
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="mt-2 pt-2 border-t flex justify-end">
                                    <DataCorrectionDialog
                    entityType="store"
                    entityId={store.id}
                    entityName={store.name}
                    trigger={
                    <button className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                                                <Flag className="w-3 h-3" /> Report issue
                                            </button>
                    } />

                                </div>
                            </div>
                        </Popup>
                    </Marker>
          )}
                {routeGeometry && <Polyline positions={routeGeometry} color="blue" />}
             </MapContainer>
        }
      </Card>

      {/* Chain List */}
      <div className="space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Stores by Chain
          </h3>
          {groupedChains.map((chain) =>
        <Card key={chain.id} className="overflow-hidden border border-gray-200 dark:border-gray-700 transition-all hover:border-indigo-200 dark:hover:border-indigo-700 dark:bg-gray-800">
                  <div
            className="p-4 flex items-center justify-between cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            onClick={() => setExpandedChain(expandedChain === chain.id ? null : chain.id)}>

                      <div className="flex items-center gap-3">
                          {chain.logo ?
              <img
                src={chain.logo}
                alt={chain.name}
                className="w-8 h-8 rounded-full object-contain bg-white shadow-sm border border-gray-100 dark:border-gray-600" /> :


              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style={{ background: chain.color }}>
                                  {chain.name.substring(0, 2).toUpperCase()}
                              </div>
              }
                          <div>
                              <h4 className="font-bold text-gray-900 dark:text-gray-100">{chain.name}</h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{chain.stores.length} locations nearby</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                           {expandedChain === chain.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                  </div>

                  {expandedChain === chain.id &&
          <div className="bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                          {chain.stores.map((store) =>
            <div key={store.id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm flex justify-between items-center group hover:border-indigo-200 dark:hover:border-indigo-700">
                                  <div className="cursor-pointer flex-1" onClick={() => {setSelectedStore(store);window.scrollTo({ top: 300, behavior: 'smooth' });}}>
                                      <div className="flex items-start justify-between pr-2 gap-2">
                                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{store.name}</div>
                                          {store.average_rating > 0 &&
                                      <div className="flex flex-col items-end gap-0.5">
                                                  <div className="flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">
                                                      <Star className="w-3 h-3 fill-current" />
                                                      <span className="font-bold">{store.average_rating.toFixed(1)}/5</span>
                                                  </div>
                                                  <span className="text-[9px] text-gray-500 dark:text-gray-400">{store.review_count} reviews</span>
                                                  {store.sentiment && (
                                                      <span className={`text-[9px] font-medium mt-1 px-1.5 py-0.5 rounded ${
                                                          store.sentiment === 'positive' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                                          store.sentiment === 'negative' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                      }`}>
                                                          {store.sentiment.charAt(0).toUpperCase() + store.sentiment.slice(1)}
                                                      </span>
                                                  )}
                                              </div>
                                      }
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">{store.address_line}, {store.city}</div>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                          {store.drivingInfo ?
                                      <span className="text-[10px] bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                  <Car className="w-3 h-3" /> {store.drivingInfo.duration}
                                              </span> :

                                      <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                  <MapPin className="w-3 h-3" /> {store.distance.toFixed(1)} km
                                              </span>
                                      }
                                          {!store.usingRouteDuration &&
                                      <span className="text-[9px] bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
                                                  Haversine distance (beyond top 25)
                                              </span>
                                      }
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MessageSquare className="w-4 h-4 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                                            <DialogHeader>
                                                <DialogTitle>Reviews for {store.name}</DialogTitle>
                                            </DialogHeader>
                                            <StoreReviews storeId={store.id} storeName={store.name} />
                                        </DialogContent>
                                    </Dialog>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDirections(store)}>
                                        <Navigation className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    </Button>
                                    <DataCorrectionDialog
                  entityType="store"
                  entityId={store.id}
                  entityName={store.name}
                  trigger={
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500">
                                                <Flag className="w-4 h-4" />
                                            </Button>
                  } />

                                  </div>
                              </div>
            )}
                      </div>
          }
              </Card>
        )}
      </div>
    </div>);

}