import axios from 'axios';

// Create axios instance with default configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  timeout: 30000, // Increased to 30 seconds for complex scheduling operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
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

// API service methods
export const apiService = {
  // Generic HTTP methods
  get: (url, config = {}) => api.get(url, config),
  post: (url, data = {}, config = {}) => api.post(url, data, config),
  put: (url, data = {}, config = {}) => api.put(url, data, config),
  delete: (url, config = {}) => api.delete(url, config),
  patch: (url, data = {}, config = {}) => api.patch(url, data, config),

  // Jobs API
  jobs: {
    getAll: (params = {}) => api.get('/api/jobs', { params }),
    getById: (id) => api.get(`/api/jobs/${id}`),
    create: (data) => api.post('/api/jobs', data),
    update: (id, data) => api.put(`/api/jobs/${id}`, data),
    delete: (id) => api.delete(`/api/jobs/${id}`),
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
    getAll: (params = {}) => api.get('/api/machines', { params }),
    getById: (id) => api.get(`/api/machines/${id}`),
    create: (data) => api.post('/api/machines', data),
    update: (id, data) => api.put(`/api/machines/${id}`, data),
    delete: (id) => api.delete(`/api/machines/${id}`),
    getGroups: () => api.get('/api/machines/groups/all'),
    createGroup: (data) => api.post('/api/machines/groups', data),
    updateGroup: (id, data) => api.put(`/api/machines/groups/${id}`, data),
    deleteGroup: (id) => api.delete(`/api/machines/groups/${id}`),
    getAvailable: (jobId, params = {}) => api.get(`/api/machines/available/${jobId}`, { params }),
    // Operator assignments
    getOperators: (machineId) => api.get(`/api/machines/operators/${machineId}`),
    assignOperator: (data) => api.post('/api/machines/operators', data),
    updateOperatorAssignment: (id, data) => api.put(`/api/machines/operators/${id}`, data),
    removeOperatorAssignment: (id) => api.delete(`/api/machines/operators/${id}`),
    getAvailabilityMatrix: (params = {}) => api.get('/api/machines/availability-matrix', { params }),
  },

  // Employees API
  employees: {
    getAll: (params = {}) => api.get('/api/employees', { params }),
    getById: (id) => api.get(`/api/employees/${id}`),
    create: (data) => api.post('/api/employees', data),
    update: (id, data) => api.put(`/api/employees/${id}`, data),
    delete: (id) => api.delete(`/api/employees/${id}`),
    getWorkSchedules: (id) => api.get(`/api/employees/${id}/work-schedules`),
    updateWorkSchedules: (id, data) => api.put(`/api/employees/${id}/work-schedules`, data),
    getAvailability: (id, params = {}) => api.get(`/api/employees/${id}/availability`, { params }),
    addAvailability: (id, data) => api.post(`/api/employees/${id}/availability`, data),
    updateAvailability: (availabilityId, data) => api.put(`/api/employees/availability/${availabilityId}`, data),
    deleteAvailability: (availabilityId) => api.delete(`/api/employees/availability/${availabilityId}`),
    getAvailable: (startTime, endTime) => api.get(`/api/employees/available/${startTime}/${endTime}`),
  },

  // Schedules API
  schedules: {
    getAll: (params = {}) => api.get('/api/schedules', { params }),
    getById: (id) => api.get(`/api/schedules/${id}`),
    create: (data) => api.post('/api/schedules', data),
    update: (id, data) => api.put(`/api/schedules/${id}`, data),
    delete: (id) => api.delete(`/api/schedules/${id}`),
    getDashboardSummary: (params = {}) => api.get('/api/schedules/dashboard/summary', { params }),
    getMachineView: (params = {}) => api.get('/api/schedules/machine-view', { params }),
    suggest: (data) => api.post('/api/schedules/suggest', data),
  },

  // Health check
  health: () => api.get('/api/health'),
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

// Export the axios instance for direct use if needed
export default api;
