import { base44 } from "@/api/base44Client";

class StoreManager {
    constructor() {
        this.stores = [];
        this.loading = false;
        this.progress = 0;
        this.error = null;
        this.listeners = [];
        
        // Initialize with cached data if available
        try {
            const cached = localStorage.getItem('cached_stores');
            if (cached) {
                this.stores = JSON.parse(cached);
            }
        } catch (e) {
            console.error("Failed to load cached stores", e);
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        // Return current state immediately
        listener(this.getState());
        
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        const state = this.getState();
        this.listeners.forEach(l => l(state));
    }

    getState() {
        return {
            stores: this.stores,
            loading: this.loading,
            progress: this.progress,
            error: this.error
        };
    }

    async startFetch(latitude, longitude, weights = {}) {
        if (this.loading) return;

        this.loading = true;
        this.progress = 0;
        this.error = null;
        this.stores = []; 
        this.notify();

        try {
            let batch = 0;
            let hasMore = true;
            let allStores = [];
            const { distanceWeight = 50, ratingWeight = 30, sentimentWeight = 20 } = weights;

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
                this.stores = allStores;

                hasMore = response.data.hasMore;
                batch++;
                this.progress = Math.min((batch / 5) * 100, 95);
                this.notify();
            }

            this.progress = 100;
            localStorage.setItem('cached_stores', JSON.stringify(this.stores));
            this.notify();

        } catch (err) {
            console.error(err);
            this.error = 'Failed to fetch stores: ' + (err.message || 'Unknown error');
            this.notify();
        } finally {
            this.loading = false;
            this.notify();
        }
    }
}

export const storeManager = new StoreManager();