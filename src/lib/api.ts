import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Only override to a relative /api path in a live web environment (not native Android/iOS).
// On native Capacitor apps, window.location.hostname is 'localhost' from the embedded server,
// so we MUST use the absolute VITE_API_URL pointing to the real backend server.
if (!Capacitor.isNativePlatform() && typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.startsWith('192.168.')) {
    API_URL = '/api';
  }
}

console.log('[api.ts] Resolved API_URL:', API_URL, '| Platform:', Capacitor.getPlatform());

if (Capacitor.isNativePlatform() && (API_URL === '/api' || API_URL.startsWith('/'))) {
  API_URL = 'http://192.168.1.8:8000/api';
  console.log('[api.ts] Native platform detected with relative URL. Falling back to dev API:', API_URL);
}


const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  timeout: 60000, // 60 seconds default timeout
});

api.interceptors.request.use(async (config) => {
  const { value: token } = await Preferences.get({ key: 'criclab_token' });
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('Axios Interceptor Error:', err.response?.status, err.config?.url, err.message);
    if (err.response?.status === 401 && !err.config?.url?.includes('/login') && !err.config?.url?.includes('/register')) {
      Preferences.remove({ key: 'criclab_token' }).catch((e) => console.error('Failed to remove token:', e));
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
export const setToken = async (token: string) => {
  await Preferences.set({ key: 'criclab_token', value: token });
};
export const getToken = async () => {
  const { value } = await Preferences.get({ key: 'criclab_token' });
  return value;
};
export const clearToken = async () => {
  await Preferences.remove({ key: 'criclab_token' });
};
