import { useState, useEffect, useRef } from 'react';

/**
 * Simple API cache hook to prevent duplicate requests
 * @param {string} key - Unique cache key
 * @param {Function} fetcher - Function that returns a promise with data
 * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
 * @returns {Object} { data, loading, error, refetch }
 */
export const useApiCache = (key, fetcher, ttl = 5 * 60 * 1000) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cache = useRef(new Map());
  const pendingRequests = useRef(new Map());

  const getCachedData = (cacheKey) => {
    const cached = cache.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  };

  const setCachedData = (cacheKey, newData) => {
    cache.current.set(cacheKey, {
      data: newData,
      timestamp: Date.now()
    });
  };

  const fetchData = async (force = false) => {
    // Check cache first (unless forced)
    if (!force) {
      const cachedData = getCachedData(key);
      if (cachedData) {
        setData(cachedData);
        setError(null);
        return cachedData;
      }
    }

    // Check if request is already pending
    if (pendingRequests.current.has(key)) {
      return pendingRequests.current.get(key);
    }

    setLoading(true);
    setError(null);

    const requestPromise = fetcher()
      .then((result) => {
        setCachedData(key, result);
        setData(result);
        setError(null);
        pendingRequests.current.delete(key);
        return result;
      })
      .catch((err) => {
        setError(err);
        setData(null);
        pendingRequests.current.delete(key);
        throw err;
      })
      .finally(() => {
        setLoading(false);
      });

    pendingRequests.current.set(key, requestPromise);
    return requestPromise;
  };

  const refetch = () => fetchData(true);

  useEffect(() => {
    if (key && fetcher) {
      fetchData();
    }
  }, [key]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pendingRequests.current.delete(key);
    };
  }, [key]);

  return { data, loading, error, refetch };
};

export default useApiCache;