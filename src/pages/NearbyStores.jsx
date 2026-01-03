import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Navigation, Star, Phone, Clock, Loader2, AlertCircle, Target, Car, Bus } from 'lucide-react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';

export default function NearbyStores() {
  const [stores, setStores] = useState([]);
  const [recommendedStore, setRecommendedStore] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [locationPermission, setLocationPermission] = useState('prompt');

  const getUserLocation = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        setLocationPermission('granted');
        
        try {
          const response = await base44.functions.invoke('getNearbyStores', {
            latitude,
            longitude,
            radius: 5
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
        setLocationPermission('denied');
        setError('Unable to get your location. Please enable location access.');
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  useEffect(() => {
    getUserLocation();
  }, []);

  const openInMaps = (store) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;
    window.open(mapsUrl, '_blank');
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
            {stores.length} store{stores.length !== 1 ? 's' : ''} within 5 km
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

      {/* Google Map */}
      <Card className="overflow-hidden shadow-lg border-2 border-indigo-100 h-[400px]">
        <LoadScript googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : { lat: 32.0853, lng: 34.7818 }}
            zoom={13}
          >
            {userLocation && (
              <Marker
                position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
                icon="http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                title="You"
              />
            )}
            {stores.map(store => (
              <Marker
                key={store.id}
                position={{ lat: store.latitude, lng: store.longitude }}
                icon={store.id === recommendedStore?.id 
                  ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png" 
                  : "http://maps.google.com/mapfiles/ms/icons/red-dot.png"}
                onClick={() => setSelectedStore(store)}
              />
            ))}
            {selectedStore && (
              <InfoWindow
                position={{ lat: selectedStore.latitude, lng: selectedStore.longitude }}
                onCloseClick={() => setSelectedStore(null)}
              >
                <div className="p-2 max-w-xs">
                  <h4 className="font-bold text-sm mb-1">{selectedStore.name}</h4>
                  <p className="text-xs text-gray-600 mb-2">{selectedStore.address_line}</p>
                  <Button 
                    size="sm" 
                    className="w-full h-6 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => openInMaps(selectedStore)}
                  >
                    Navigate
                  </Button>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </LoadScript>
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
                  {!recommendedStore.drivingInfo && (
                    <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-indigo-600" />
                        <span className="font-semibold">{recommendedStore.distance.toFixed(1)} km</span>
                    </div>
                  )}
                  {recommendedStore.drivingInfo && (
                      <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1" title="Driving">
                              <Car className="w-4 h-4 text-indigo-600" />
                              <span className="font-semibold">{recommendedStore.drivingInfo.duration} ({recommendedStore.drivingInfo.distance})</span>
                          </div>
                          {recommendedStore.transitInfo && (
                                <div className="flex items-center gap-1" title="Public Transport">
                                  <Bus className="w-4 h-4 text-indigo-600" />
                                  <span className="font-semibold">{recommendedStore.transitInfo.duration}</span>
                              </div>
                          )}
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
              onClick={() => openInMaps(recommendedStore)}
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
                      {!store.drivingInfo && (
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{store.distance.toFixed(1)} km away</span>
                        </div>
                      )}
                      
                      {store.drivingInfo && (
                           <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1" title="Driving">
                                    <Car className="w-3 h-3 text-gray-500" />
                                    <span>{store.drivingInfo.duration} ({store.drivingInfo.distance})</span>
                                </div>
                                {store.transitInfo && (
                                     <div className="flex items-center gap-1" title="Public Transport">
                                        <Bus className="w-3 h-3 text-gray-500" />
                                        <span>{store.transitInfo.duration}</span>
                                    </div>
                                )}
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
                    onClick={() => openInMaps(store)}
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