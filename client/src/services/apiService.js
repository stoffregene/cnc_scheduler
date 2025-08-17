import axios from 'axios';

// Create axios instance with default configuration
const apiBaseURL = 'http://192.168.1.14:5000'; // Use actual IP address for mobile access
console.log('🌐 API Base URL:', apiBaseURL); // Debug log
console.log('🌐 Environment REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('🌐 Window location:', window.location.href);
const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000, // Increased to 30 seconds for complex scheduling operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request deduplication cache
const pendingRequests = new Map();

// Helper function to generate cache key
const generateCacheKey = (config) => {
  return `${config.method}:${config.url}:${JSON.stringify(config.params || {})}`;
};

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // Check for both token names for compatibility
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - redirect to login
          localStorage.removeItem('authToken');
          localStorage.removeItem('token');
          window.location.href = '/login';
          break;
        case 403:
          // Forbidden
          console.error('Access forbidden:', data);
          break;
        case 404:
          // Not found
          console.error('Resource not found:', data);
          break;
        case 500:
          // Server error
          console.error('Server error:', data);
          break;
        default:
          console.error('API error:', data);
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network error:', error.request);
    } else {
      // Something else happened
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Request deduplication function
const withDeduplication = (fn) => {
  return async (...args) => {
    const cacheKey = generateCacheKey({ 
      method: fn.name, 
      url: args[0], 
      params: args[1]?.params || args[1] 
    });
    
    // Check if request is already pending
    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey);
    }
    
    // Execute request and cache promise
    const promise = fn(...args);
    pendingRequests.set(cacheKey, promise);
    
    try {
      const result = await promise;
      pendingRequests.delete(cacheKey);
      return result;
    } catch (error) {
      pendingRequests.delete(cacheKey);
      throw error;
    }
  };
};

// API service methods
const apiService = {
  // Generic HTTP methods
  get: withDeduplication(async (url, config = {}) => {
    const response = await api.get(url, config);
    return response.data;
  }),
  post: async (url, data = {}, config = {}) => {
    // Add detailed logging for mobile debugging
    console.log('🔄 API POST Request:', {
      url,
      data: url.includes('login') ? { username: data.username, password: '[HIDDEN]' } : data,
      config,
      baseURL: api.defaults.baseURL,
      timestamp: new Date().toISOString()
    });
    
    try {
      const response = await api.post(url, data, config);
      console.log('✅ API POST Success:', {
        url,
        status: response.status,
        timestamp: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('❌ API POST Error:', {
        url,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  },
  put: async (url, data = {}, config = {}) => {
    const response = await api.put(url, data, config);
    return response.data;
  },
  delete: async (url, config = {}) => {
    const response = await api.delete(url, config);
    return response.data;
  },
  patch: async (url, data = {}, config = {}) => {
    const response = await api.patch(url, data, config);
    return response.data;
  },

  // Auth token management
  setAuthToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
    }
  },

  // Authentication API
  auth: {
    login: (credentials) => apiService.post('/api/auth/login', credentials),
    logout: () => apiService.post('/api/auth/logout'),
    me: () => apiService.get('/api/auth/me'),
    changePassword: (data) => apiService.post('/api/auth/change-password', data),
  },

  // Users API (admin only)
  users: {
    getAll: () => apiService.get('/api/users'),
    getById: (id) => apiService.get(`/api/users/${id}`),
    create: (data) => apiService.post('/api/users', data),
    update: (id, data) => apiService.put(`/api/users/${id}`, data),
    delete: (id) => apiService.delete(`/api/users/${id}`),
    resetPassword: (id, newPassword) => apiService.post(`/api/users/${id}/reset-password`, { newPassword }),
  },

  // Jobs API
  jobs: {
    getAll: (params = {}) => apiService.get('/api/jobs', { params }),
    getById: (id) => apiService.get(`/api/jobs/${id}`),
    create: (data) => apiService.post('/api/jobs', data),
    update: (id, data) => apiService.put(`/api/jobs/${id}`, data),
    delete: (id) => apiService.delete(`/api/jobs/${id}`),
    deleteAll: () => apiService.delete('/api/jobs/delete-all'),
    importCSV: (file) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      return api.post('/api/jobs/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    },
  },

  // Machines API
  machines: {
    getAll: (params = {}) => apiService.get('/api/machines', { params }),
    getById: (id) => apiService.get(`/api/machines/${id}`),
    create: (data) => apiService.post('/api/machines', data),
    update: (id, data) => apiService.put(`/api/machines/${id}`, data),
    delete: (id) => apiService.delete(`/api/machines/${id}`),
    getGroups: () => apiService.get('/api/machines/groups/all'),
    createGroup: (data) => apiService.post('/api/machines/groups', data),
    updateGroup: (id, data) => apiService.put(`/api/machines/groups/${id}`, data),
    deleteGroup: (id) => apiService.delete(`/api/machines/groups/${id}`),
    getAvailable: (jobId, params = {}) => apiService.get(`/api/machines/available/${jobId}`, { params }),
    // Operator assignments
    getOperators: (machineId) => apiService.get(`/api/machines/operators/${machineId}`),
    assignOperator: (data) => apiService.post('/api/machines/operators', data),
    updateOperatorAssignment: (id, data) => apiService.put(`/api/machines/operators/${id}`, data),
    removeOperatorAssignment: (id) => apiService.delete(`/api/machines/operators/${id}`),
    getAvailabilityMatrix: (params = {}) => apiService.get('/api/machines/availability-matrix', { params }),
  },

  // Employees API
  employees: {
    getAll: (params = {}) => apiService.get('/api/employees', { params }),
    getById: (id) => apiService.get(`/api/employees/${id}`),
    create: (data) => apiService.post('/api/employees', data),
    update: (id, data) => apiService.put(`/api/employees/${id}`, data),
    delete: (id) => apiService.delete(`/api/employees/${id}`),
    getWorkSchedules: (id) => apiService.get(`/api/employees/${id}/work-schedules`),
    updateWorkSchedules: (id, data) => apiService.put(`/api/employees/${id}/work-schedules`, data),
    getAvailability: (id, params = {}) => apiService.get(`/api/employees/${id}/availability`, { params }),
    addAvailability: (id, data) => apiService.post(`/api/employees/${id}/availability`, data),
    updateAvailability: (availabilityId, data) => apiService.put(`/api/employees/availability/${availabilityId}`, data),
    deleteAvailability: (availabilityId) => apiService.delete(`/api/employees/availability/${availabilityId}`),
    getAvailable: (startTime, endTime) => apiService.get(`/api/employees/available/${startTime}/${endTime}`),
  },

  // Schedules API
  schedules: {
    getAll: (params = {}) => apiService.get('/api/schedules', { params }),
    getById: (id) => apiService.get(`/api/schedules/${id}`),
    create: (data) => apiService.post('/api/schedules', data),
    update: (id, data) => apiService.put(`/api/schedules/${id}`, data),
    delete: (id) => apiService.delete(`/api/schedules/${id}`),
    getDashboardSummary: (params = {}) => apiService.get('/api/schedules/dashboard/summary', { params }),
    getMachineView: (params = {}) => apiService.get('/api/schedules/machine-view', { params }),
    suggest: (data) => apiService.post('/api/schedules/suggest', data),
  },

  // Health check
  health: () => apiService.get('/api/health'),
};

// File upload helper
export const uploadFile = (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  return api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percentCompleted);
      }
    },
  });
};

// Export both the structured API service and the axios instance
export { apiService };

// Export the axios instance for direct use if needed (for backward compatibility)
export default api;
