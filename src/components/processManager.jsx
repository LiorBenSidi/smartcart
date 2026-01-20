import { base44 } from '@/api/base44Client';

class ProcessManager {
  constructor() {
    this.state = {
      loading: false,
      progress: 0,
      status: '',
      error: null,
      results: null
    };
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  getState() {
    return this.state;
  }

  async startProcess(functionName, initialPayload = {}) {
    if (this.state.loading) return;

    this.state = {
      loading: true,
      progress: 0,
      status: 'Starting...',
      error: null,
      results: []
    };
    this.notify();

    try {
      let batch = 0;
      let hasMore = true;
      let allResults = [];
      const BATCH_SIZE = 5; // Conservative batch size for heavy LLM operations

      while (hasMore) {
        this.state.status = `Processing batch ${batch + 1}...`;
        this.notify();

        const response = await base44.functions.invoke(functionName, {
          ...initialPayload,
          batch,
          limit: BATCH_SIZE
        });

        const data = response.data;
        
        if (data.error) throw new Error(data.error);

        // Aggregate results if present
        if (data.results) {
            allResults = [...allResults, ...data.results];
        }
        
        // Also capture other data if needed (like chainResults)
        if (data.chainResults) {
            // Append or merge? Usually chain results come at the end
            this.state.chainResults = data.chainResults;
        }

        // Update progress
        // Ideally backend returns total or progress %
        if (data.progress !== undefined) {
            this.state.progress = data.progress;
        } else {
            // Fake progress if not provided
            this.state.progress = Math.min(90, (batch + 1) * 5);
        }
        
        if (data.message) {
             this.state.status = data.message;
        }

        hasMore = data.hasMore;
        batch++;
      }

      this.state = {
        ...this.state,
        loading: false,
        progress: 100,
        status: 'Completed',
        error: null,
        results: allResults
      };
      this.notify();

      return this.state;

    } catch (error) {
      console.error(`Process ${functionName} failed:`, error);
      this.state = {
        ...this.state,
        loading: false,
        error: error.message,
        status: 'Failed'
      };
      this.notify();
      throw error;
    }
  }
}

export const processManager = new ProcessManager();