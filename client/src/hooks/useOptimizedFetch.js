import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Optimized data fetching hook with deduplication and caching
 * @param {Function} fetcher - Async function that fetches the data
 * @param {Array} dependencies - Dependencies array for when to refetch
 * @param {Object} options - Options object
 * @returns {Object} { data, loading, error, refetch }
 */
export const useOptimizedFetch = (fetcher, dependencies = [], options = {}) => {
  const {
    initialData = null,
    enabled = true,
    cacheTime = 5 * 60 * 1000, // 5 minutes
    staleTime = 1 * 60 * 1000, // 1 minute
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const cache = useRef(new Map());
  const abortController = useRef(null);
  const lastFetch = useRef(0);

  const getCacheKey = useCallback(() => {
    return JSON.stringify(dependencies);
  }, [dependencies]);

  const getCachedData = useCallback(() => {
    const key = getCacheKey();
    const cached = cache.current.get(key);
    
    if (!cached) return null;
    
    const now = Date.now();
    const isStale = now - cached.timestamp > staleTime;
    const isExpired = now - cached.timestamp > cacheTime;
    
    if (isExpired) {
      cache.current.delete(key);
      return null;
    }
    
    return { data: cached.data, isStale };
  }, [getCacheKey, staleTime, cacheTime]);

  const setCachedData = useCallback((newData) => {
    const key = getCacheKey();
    cache.current.set(key, {
      data: newData,
      timestamp: Date.now()
    });
  }, [getCacheKey]);

  const fetchData = useCallback(async (force = false) => {
    if (!enabled) return;

    // Check cache first
    const cached = getCachedData();
    if (cached && !force && !cached.isStale) {
      setData(cached.data);
      setError(null);
      return cached.data;
    }

    // Prevent multiple concurrent requests
    const now = Date.now();
    if (!force && now - lastFetch.current < 100) {
      return;
    }
    lastFetch.current = now;

    // Cancel previous request
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const result = await fetcher({ signal: abortController.current.signal });
      
      if (!abortController.current.signal.aborted) {
        setData(result);
        setCachedData(result);
        setError(null);
      }
      
      return result;
    } catch (err) {
      if (!abortController.current.signal.aborted) {
        setError(err);
        console.error('Fetch error:', err);
      }
      throw err;
    } finally {
      if (!abortController.current.signal.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, fetcher, getCachedData, setCachedData]);

  const refetch = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  // Effect for dependency changes
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch
  };
};

export default useOptimizedFetch;