import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Navigation, Star, Phone, Clock, Loader2, AlertCircle, Target, Car, Bus, Layers, ChevronDown, ChevronUp, Trophy, Medal } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
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
    if (bounds) map.fitBounds(bounds, { padding: [50, 50] });
    else if (center) map.setView(center, 14);
  }, [center, bounds, map]);

  useEffect(() => {
    if (selectedStore) map.setView([selectedStore.latitude, selectedStore.longitude], 16, { animate: true });
  }, [selectedStore, map]);

  return null;
}

export default function NearbyStores() {
  const [stores, setStores] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [expandedChain, setExpandedChain] = useState(null);

  const getUserLocation = () => {
    setLoading(true);
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        try {
          const response = await base44.functions.invoke('getNearbyStores', { latitude, longitude });
          setStores(response.data.nearbyStores || []);
        } catch (err) {
          setError('Failed to fetch stores: ' + err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        base44.functions.invoke('getNearbyStores', { latitude: 32.0853, longitude: 34.7818 })
            .then(res => { setStores(res.data.nearbyStores || []); setLoading(false); })
            .catch(() => setLoading(false));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => { getUserLocation(); }, []);

  // Constants
  const CHAIN_COLORS = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
    '#6366F1', '#84CC16', '#14B8A6', '#F97316', '#06B6D4', '#D946EF'
  ];

  const getChainColor = (chainId) => {
    if (!chainId) return '#6b7280';
    let hash = 0;
    for (let i = 0; i < chainId.length; i++) hash = chainId.charCodeAt(i) + ((hash << 5) - hash);
    return CHAIN_COLORS[Math.abs(hash) % CHAIN_COLORS.length];
  };

  const createMarkerIcon = (store, isClosest) => {
      const color = getChainColor(store.chain_id);
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${isClosest ? 48 : 32}" height="${isClosest ? 48 : 32}">
          <path fill="${color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="8" r="3.5" fill="white"/>
          ${isClosest ? `<circle cx="12" cy="8" r="1.5" fill="${color}"/><path d="M12 -4 L12 -12" stroke="${color}" stroke-width="2" />` : ''}
        </svg>
      `;
      return L.divIcon({
          className: 'custom-marker-icon',
          html: svg,
          iconSize: [isClosest ? 48 : 32, isClosest ? 48 : 32],
          iconAnchor: [isClosest ? 24 : 16, isClosest ? 48 : 32],
          popupAnchor: [0, isClosest ? -48 : -32],
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
                setRouteGeometry(res.data.geometry.coordinates.map(c => [c[1], c[0]]));
                setSelectedStore(store);
            }
        } catch (e) { console.error("Routing failed", e); } 
        finally { setCalculatingRoute(false); }
    }
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation?.[0]}%2C${userLocation?.[1]}%3B${store.latitude}%2C${store.longitude}`;
    window.open(url, '_blank');
  };

  // Grouping and Sorting Logic
  const { top3Stores, groupedChains } = useMemo(() => {
    if (!stores.length) return { top3Stores: [], groupedChains: [] };

    // 1. Identify Top 3 by Driving (or Linear if missing)
    const sortedByDrive = [...stores].sort((a, b) => {
        const durA = a.drivingInfo?.rawDuration || Infinity;
        const durB = b.drivingInfo?.rawDuration || Infinity;
        if (durA !== durB) return durA - durB;
        return a.distance - b.distance;
    });
    const top3 = sortedByDrive.slice(0, 3);

    // 2. Group by Chain
    const groups = stores.reduce((acc, store) => {
        if (!acc[store.chain_id]) {
            acc[store.chain_id] = {
                id: store.chain_id,
                name: store.chain_name || 'Unknown Chain',
                color: getChainColor(store.chain_id),
                stores: []
            };
        }
        acc[store.chain_id].stores.push(store);
        return acc;
    }, {});
    
    // Sort groups by name
    const sortedGroups = Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));

    return { top3Stores: top3, groupedChains: sortedGroups };
  }, [stores]);

  const getBounds = () => {
    if (!userLocation && !stores.length) return null;
    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend(userLocation);
    stores.forEach(s => bounds.extend([s.latitude, s.longitude]));
    return bounds;
  };

  if (loading) return <div className="h-64 flex flex-col items-center justify-center"><Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" /><p className="text-gray-600">Finding stores...</p></div>;
  if (error) return <div className="text-center p-8 text-red-500 bg-red-50 rounded-lg">{error}<Button onClick={getUserLocation} className="mt-4 block mx-auto">Retry</Button></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
           <h2 className="text-2xl font-bold text-gray-900">Nearby Stores</h2>
           <p className="text-sm text-gray-500">{stores.length} locations found</p>
        </div>
        <Button variant="outline" size="sm" onClick={getUserLocation}><Navigation className="w-4 h-4 mr-2" /> Refresh</Button>
      </div>

      {/* Top 3 Podium */}
      {top3Stores.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
              {top3Stores.map((store, idx) => {
                  const medalColor = idx === 0 ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 
                                     idx === 1 ? 'bg-slate-100 border-slate-300 text-slate-700' : 
                                     'bg-orange-100 border-orange-300 text-orange-800';
                  const iconColor = idx === 0 ? 'text-yellow-600' : idx === 1 ? 'text-slate-500' : 'text-orange-600';
                  
                  return (
                      <Card key={store.id} className={`relative overflow-hidden border-2 ${idx === 0 ? 'border-yellow-400 shadow-md ring-1 ring-yellow-200' : idx === 1 ? 'border-slate-300' : 'border-orange-300'} transition-all hover:scale-105 cursor-pointer`} onClick={() => setSelectedStore(store)}>
                          <div className={`absolute top-0 left-0 w-full h-1 ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-500'}`} />
                          <CardContent className="p-3 flex flex-col items-center text-center">
                              <Trophy className={`w-6 h-6 mb-2 ${iconColor}`} />
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 uppercase tracking-wide ${medalColor}`}>
                                  {idx === 0 ? '1st Place' : idx === 1 ? '2nd Place' : '3rd Place'}
                              </div>
                              <h3 className="font-bold text-sm text-gray-900 truncate w-full">{store.name}</h3>
                              <p className="text-xs text-gray-500 truncate w-full mb-2">{store.chain_name}</p>
                              <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-1 rounded">
                                  <Car className="w-3 h-3" />
                                  {store.drivingInfo?.duration || `${store.distance.toFixed(1)} km`}
                              </div>
                          </CardContent>
                      </Card>
                  );
              })}
          </div>
      )}

      {/* Map */}
      <Card className="overflow-hidden shadow-lg border-2 border-indigo-100 h-[350px] relative z-0">
         {typeof window !== 'undefined' && (
             <MapContainer center={userLocation || [32.0853, 34.7818]} zoom={12} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController center={userLocation} bounds={getBounds()} selectedStore={selectedStore} />
                {userLocation && <Marker position={userLocation} icon={UserIcon}><Popup>You</Popup></Marker>}
                {stores.map((store, idx) => (
                    <Marker 
                        key={store.id} 
                        position={[store.latitude, store.longitude]} 
                        icon={createMarkerIcon(store, idx === 0)}
                        eventHandlers={{ click: () => setSelectedStore(store) }}
                    >
                        <Popup>
                            <div className="p-1">
                                <h4 className="font-bold text-sm">{store.name}</h4>
                                <p className="text-xs text-gray-600 mb-2">{store.address_line}</p>
                                <Button size="sm" className="w-full h-6 text-xs bg-indigo-600" onClick={() => openDirections(store)}>Navigate</Button>
                            </div>
                        </Popup>
                    </Marker>
                ))}
                {routeGeometry && <Polyline positions={routeGeometry} color="blue" />}
             </MapContainer>
         )}
      </Card>

      {/* Chain List */}
      <div className="space-y-4">
          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" /> Stores by Chain
          </h3>
          {groupedChains.map(chain => (
              <Card key={chain.id} className="overflow-hidden border border-gray-200 transition-all hover:border-indigo-200">
                  <div 
                      className="p-4 flex items-center justify-between cursor-pointer bg-white hover:bg-gray-50"
                      onClick={() => setExpandedChain(expandedChain === chain.id ? null : chain.id)}
                  >
                      <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style={{ background: chain.color }}>
                              {chain.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                              <h4 className="font-bold text-gray-900">{chain.name}</h4>
                              <p className="text-xs text-gray-500">{chain.stores.length} locations nearby</p>
                          </div>
                      </div>
                      <div className="flex items-center gap-2">
                           {expandedChain === chain.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                  </div>
                  
                  {expandedChain === chain.id && (
                      <div className="bg-gray-50 border-t border-gray-100 p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                          {chain.stores.map(store => (
                              <div key={store.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex justify-between items-center group hover:border-indigo-200">
                                  <div className="cursor-pointer" onClick={() => { setSelectedStore(store); window.scrollTo({ top: 300, behavior: 'smooth' }); }}>
                                      <div className="font-medium text-sm text-gray-900 group-hover:text-indigo-600 transition-colors">{store.name}</div>
                                      <div className="text-xs text-gray-500">{store.address_line}, {store.city}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                          {store.drivingInfo ? (
                                              <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                  <Car className="w-3 h-3" /> {store.drivingInfo.duration}
                                              </span>
                                          ) : (
                                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                  {store.distance.toFixed(1)} km
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDirections(store)}>
                                      <Navigation className="w-4 h-4 text-indigo-600" />
                                  </Button>
                              </div>
                          ))}
                      </div>
                  )}
              </Card>
          ))}
      </div>
    </div>
  );
}