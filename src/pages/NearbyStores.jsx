import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Navigation, Star, Phone, Clock, Loader2, AlertCircle, Target, Car, Bus, Layers } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Webpack/Vite
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

const StoreIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const RecommendedIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Component to handle map bounds and interactions
function MapController({ center, bounds, selectedStore }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.setView(center, 14);
    }
  }, [center, bounds, map]);

  useEffect(() => {
    if (selectedStore) {
        map.setView([selectedStore.latitude, selectedStore.longitude], 16, { animate: true });
    }
  }, [selectedStore, map]);

  return null;
}

export default function NearbyStores() {
  const [stores, setStores] = useState([]);
  const [recommendedStore, setRecommendedStore] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [routeGeometry, setRouteGeometry] = useState(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);

  const getUserLocation = () => {
    setLoading(true);
    setError(null);
    setRouteGeometry(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        
        try {
          const response = await base44.functions.invoke('getNearbyStores', {
            latitude,
            longitude,
            // radius: 5 // Commented out to fetch all stores
          });

          setStores(response.data.nearbyStores || []);
          setRecommendedStore(response.data.recommendedStore || null);
        } catch (err) {
          setError('Failed to fetch nearby stores: ' + err.message);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        // Fallback if location denied - fetch all stores centered on Tel Aviv
        base44.functions.invoke('getNearbyStores', {
            latitude: 32.0853,
            longitude: 34.7818,
        }).then(res => {
            setStores(res.data.nearbyStores || []);
            setLoading(false);
        }).catch(() => setLoading(false));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Fixed color palette for chains to ensure distinct and pleasing colors
  const CHAIN_COLORS = [
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#84CC16', // Lime
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#06B6D4', // Cyan
    '#D946EF', // Fuchsia
  ];

  const getChainColor = (chainId) => {
    if (!chainId) return '#6b7280'; // Gray for unknown
    
    // Simple hash to index
    let hash = 0;
    for (let i = 0; i < chainId.length; i++) {
      hash = chainId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % CHAIN_COLORS.length;
    return CHAIN_COLORS[index];
  };

  const createMarkerIcon = (store, isClosest) => {
      const color = getChainColor(store.chain_id);
      
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${isClosest ? 48 : 32}" height="${isClosest ? 48 : 32}">
          <path fill="${color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8z" stroke="white" stroke-width="1.5"/>
          <circle cx="12" cy="8" r="3.5" fill="white"/>
          ${isClosest ? `<circle cx="12" cy="8" r="1.5" fill="${color}"/><path d="M12 -4 L12 -12" stroke="${color}" stroke-width="2" />` : ''}
          ${isClosest ? `<text x="12" y="-5" text-anchor="middle" fill="#1f2937" font-weight="bold" font-size="8" stroke="white" stroke-width="0.5">Closest</text>` : ''}
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

  useEffect(() => {
    getUserLocation();
  }, []);

  const openDirections = async (store) => {
    // 1. Calculate internal route to display on map
    if (userLocation) {
        setCalculatingRoute(true);
        try {
            const res = await base44.functions.invoke('getRoute', {
                origin: { lat: userLocation[0], lon: userLocation[1] },
                destination: { lat: store.latitude, lon: store.longitude },
                mode: 'driving'
            });
            if (res.data && res.data.geometry) {
                // OSRM returns GeoJSON (lon, lat), Leaflet needs [lat, lon]
                const latLngs = res.data.geometry.coordinates.map(c => [c[1], c[0]]);
                setRouteGeometry(latLngs);
                setSelectedStore(store);
            }
        } catch (e) {
            console.error("Routing failed", e);
        } finally {
            setCalculatingRoute(false);
        }
    }
    
    // 2. Open external directions (OSM or generic)
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation[0]}%2C${userLocation[1]}%3B${store.latitude}%2C${store.longitude}`;
    window.open(url, '_blank');
  };

  // Calculate bounds
  const getBounds = () => {
    if (!userLocation && stores.length === 0) return null;
    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend(userLocation);
    stores.forEach(s => bounds.extend([s.latitude, s.longitude]));
    return bounds;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
        <p className="text-gray-600">Finding stores near you...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Location Access Required</h3>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <Button onClick={getUserLocation} className="bg-indigo-600 hover:bg-indigo-700">
              <Navigation className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nearby Stores</h2>
          <p className="text-sm text-gray-500 mt-1">
            Showing all {stores.length} stores
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={getUserLocation}
          className="gap-2"
        >
          <Navigation className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Leaflet Map */}
      <Card className="overflow-hidden shadow-lg border-2 border-indigo-100 h-[400px] relative z-0">
        {typeof window !== 'undefined' && (
             <MapContainer 
                center={userLocation || [32.0853, 34.7818]} 
                zoom={13} 
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={false}
             >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController 
                    center={userLocation} 
                    bounds={stores.length > 0 ? getBounds() : null} 
                    selectedStore={selectedStore}
                />
                
                {userLocation && (
                    <Marker position={userLocation} icon={UserIcon}>
                        <Popup>You are here</Popup>
                    </Marker>
                )}

                {stores.map((store, index) => {
                    const isClosest = index === 0; // Stores are sorted by distance
                    return (
                    <Marker 
                        key={store.id} 
                        position={[store.latitude, store.longitude]}
                        icon={createMarkerIcon(store, isClosest)}
                        zIndexOffset={isClosest ? 1000 : 0}
                        eventHandlers={{
                            click: () => setSelectedStore(store),
                        }}
                    >
                        <Popup>
                             <div className="p-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-3 h-3 rounded-full" style={{ background: getChainColor(store.chain_id) }}></div>
                                    <h4 className="font-bold text-sm">{store.name}</h4>
                                </div>
                                {isClosest && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1 rounded mb-1 block w-fit">Closest Store</span>}
                                <p className="text-xs text-gray-600 mb-2">{store.address_line}</p>
                                <Button 
                                    size="sm" 
                                    className="w-full h-6 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => openDirections(store)}
                                >
                                    {calculatingRoute && selectedStore?.id === store.id ? 'Loading...' : 'Navigate'}
                                </Button>
                            </div>
                        </Popup>
                    </Marker>
                )})}

                {routeGeometry && <Polyline positions={routeGeometry} color="blue" />}

             </MapContainer>
        )}
      </Card>

      {/* Recommended Store */}
      {recommendedStore && (
        <Card className="border-2 border-indigo-500 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-white fill-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg text-gray-900">{recommendedStore.name}</h3>
                  <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full font-semibold">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{recommendedStore.address_line}, {recommendedStore.city}</p>
                
                <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                  {!recommendedStore.drivingInfo ? (
                    <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-indigo-600" />
                        <span className="font-semibold">{recommendedStore.distance.toFixed(1)} km</span>
                    </div>
                  ) : (
                      <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1" title="Driving">
                              <Car className="w-4 h-4 text-indigo-600" />
                              <span className="font-semibold">{recommendedStore.drivingInfo.duration} ({recommendedStore.drivingInfo.distance})</span>
                          </div>
                      </div>
                  )}
                  {recommendedStore.phone_number && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      <span>{recommendedStore.phone_number}</span>
                    </div>
                  )}
                </div>

                {recommendedStore.store_tags && recommendedStore.store_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {recommendedStore.store_tags.map((tag, idx) => (
                      <span key={idx} className="text-xs bg-white px-2 py-1 rounded-full text-gray-700 border border-indigo-200">
                        {tag.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button 
              onClick={() => openDirections(recommendedStore)}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              <Navigation className="w-4 h-4 mr-2" /> Get Directions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Other Nearby Stores */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">All Nearby Stores</h3>
        {stores.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No stores found within 5 km of your location.</p>
            </CardContent>
          </Card>
        ) : (
          stores.map((store) => (
            <Card 
              key={store.id} 
              className={`border ${store.id === recommendedStore?.id ? 'opacity-50' : 'hover:shadow-md'} transition-all`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{store.name}</h4>
                    <p className="text-xs text-gray-500 mt-1">{store.address_line}, {store.city}</p>
                    
                    <div className="flex flex-col gap-1 mt-2 text-xs text-gray-600">
                      {!store.drivingInfo ? (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{store.distance.toFixed(1)} km away</span>
                        </div>
                      ) : (
                           <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1" title="Driving">
                                    <Car className="w-3 h-3 text-gray-500" />
                                    <span>{store.drivingInfo.duration} ({store.drivingInfo.distance})</span>
                                </div>
                            </div>
                      )}

                      {store.phone_number && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{store.phone_number}</span>
                        </div>
                      )}
                    </div>

                    {store.store_tags && store.store_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {store.store_tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                            {tag.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => openDirections(store)}
                    className="flex-shrink-0"
                  >
                    <Navigation className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}