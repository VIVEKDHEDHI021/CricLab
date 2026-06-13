import axios from 'axios';

let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

if (typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  // Force relative /api path in live environments to utilize the Cloudflare Worker proxy and bypass CORS preflights
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.')) {
    API_URL = '/api';
  }
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  timeout: 60000, // 60 seconds default timeout
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('criclab_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('Axios Interceptor Error:', err.response?.status, err.config?.url, err.message);
    if (err.response?.status === 401 && !err.config?.url?.includes('/login') && !err.config?.url?.includes('/register')) {
      localStorage.removeItem('criclab_token');
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
export const setToken = (token: string) => localStorage.setItem('criclab_token', token);
export const getToken = () => localStorage.getItem('criclab_token');
export const clearToken = () => localStorage.removeItem('criclab_token');
