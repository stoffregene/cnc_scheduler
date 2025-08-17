import { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/apiService';

// Global cache for static data that doesn't change often
const staticDataCache = {
  machines: null,
  machineGroups: null,
  employees: null,
  lastFetch: {
    machines: 0,
    machineGroups: 0,
    employees: 0,
  }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for fetching and caching static data across components
 * @param {string} dataType - Type of data to fetch ('machines', 'machineGroups', 'employees')
 * @param {object} options - Options for data fetching
 * @returns {object} { data, loading, error, refetch }
 */
export const useStaticData = (dataType, options = {}) => {
  const { forceRefresh = false } = options;
  const [data, setData] = useState(staticDataCache[dataType]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const fetchData = async () => {
    // Check cache first
    const now = Date.now();
    const lastFetch = staticDataCache.lastFetch[dataType];
    const isStale = now - lastFetch > CACHE_DURATION;
    
    if (!forceRefresh && staticDataCache[dataType] && !isStale) {
      setData(staticDataCache[dataType]);
      return staticDataCache[dataType];
    }

    if (!isMounted.current) return;

    try {
      setLoading(true);
      setError(null);

      let result;
      switch (dataType) {
        case 'machines':
          result = await apiService.machines.getAll();
          break;
        case 'machineGroups':
          result = await apiService.machines.getGroups();
          break;
        case 'employees':
          result = await apiService.employees.getAll();
          break;
        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      if (!isMounted.current) return;

      // Update cache
      staticDataCache[dataType] = result.data || result;
      staticDataCache.lastFetch[dataType] = now;

      setData(staticDataCache[dataType]);
      return staticDataCache[dataType];
    } catch (err) {
      if (!isMounted.current) return;
      
      console.error(`Error fetching ${dataType}:`, err);
      setError(err);
      
      // Return cached data if available, even if stale
      if (staticDataCache[dataType]) {
        setData(staticDataCache[dataType]);
        return staticDataCache[dataType];
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const refetch = () => {
    return fetchData();
  };

  useEffect(() => {
    fetchData();
    
    return () => {
      isMounted.current = false;
    };
  }, [dataType, forceRefresh]);

  return {
    data,
    loading,
    error,
    refetch
  };
};

// Hook for fetching multiple static data types at once
export const useMultipleStaticData = (dataTypes, options = {}) => {
  const results = {};
  
  dataTypes.forEach(type => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    results[type] = useStaticData(type, options);
  });

  const loading = Object.values(results).some(result => result.loading);
  const error = Object.values(results).find(result => result.error)?.error;
  
  const data = {};
  dataTypes.forEach(type => {
    data[type] = results[type].data;
  });

  const refetchAll = () => {
    return Promise.all(
      dataTypes.map(type => results[type].refetch())
    );
  };

  return {
    data,
    loading,
    error,
    refetch: refetchAll,
    individual: results
  };
};

export default useStaticData;