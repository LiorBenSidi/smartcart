import { base44 } from '@/api/base44Client';

class ProcessManager {
  constructor() {
    this.state = {
      loading: false,
      activeProcess: null,
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

  async startProcess(functionName, initialPayload = {}, options = {}) {
    if (this.state.loading) return;

    const delayMs = options.delayMs || 0; // Delay between batches in milliseconds

    this.state = {
      loading: true,
      activeProcess: functionName,
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
      let habitOffset = 0; // For rebuildUserHabits chunked habit creation
      const BATCH_SIZE = initialPayload.limit || 5; // Use provided limit or default

      while (hasMore) {
        // Add delay between batches (skip first batch)
        if ((batch > 0 || habitOffset > 0) && delayMs > 0) {
          this.state.status = `Waiting ${delayMs}ms before next call...`;
          this.notify();
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        this.state.status = `Processing batch ${batch + 1}${habitOffset > 0 ? ` (offset ${habitOffset})` : ''}...`;
        this.notify();

        let response;
        let data;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
          response = await base44.functions.invoke(functionName, {
            ...initialPayload,
            batch,
            habitOffset,
            limit: BATCH_SIZE
          });

          data = response.data;

          // Handle rate limit - wait and retry
          if (data.error && data.error.includes('Rate limit')) {
            retries++;
            if (retries < maxRetries) {
              this.state.status = `Rate limited, waiting 30s before retry ${retries}/${maxRetries}...`;
              this.notify();
              await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s for rate limit to reset
              continue;
            }
          }
          break;
        }

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

        // Use nextBatch and nextHabitOffset if provided by backend
        if (data.nextBatch !== undefined) {
            batch = data.nextBatch;
        } else {
            batch++;
        }

        if (data.nextHabitOffset !== undefined) {
            habitOffset = data.nextHabitOffset;
        }
      }

      this.state = {
        ...this.state,
        loading: false,
        activeProcess: null,
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
        activeProcess: null,
        error: error.message,
        status: 'Failed'
      };
      this.notify();
      throw error;
    }
  }
}

export const processManager = new ProcessManager();