import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
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
