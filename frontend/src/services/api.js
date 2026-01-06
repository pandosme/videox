import axios from 'axios';

// Create axios instance with fixed base URL (same-origin)
// Frontend and backend are served from the same host/port
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // Enable sending cookies for session authentication
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if:
      // 1. Not already on login page
      // 2. Not requesting auth endpoints (session check, login attempt)
      const isLoginPage = window.location.pathname === '/login';
      const isAuthEndpoint = error.config?.url?.includes('/api/auth/');

      if (!isLoginPage && !isAuthEndpoint) {
        // Session expired during active use - redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
