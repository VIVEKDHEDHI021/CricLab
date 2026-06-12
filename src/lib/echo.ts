import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import api from '@/lib/api';

if (typeof window !== 'undefined') {
  (window as any).Pusher = Pusher;
}

const getFallbackHost = () => {
  if (typeof window === 'undefined') return '127.0.0.1';
  const apiVal = import.meta.env.VITE_API_URL;
  if (apiVal) {
    try {
      const url = new URL(apiVal);
      return url.hostname;
    } catch (e) {
      console.warn("Invalid VITE_API_URL for host parsing:", apiVal);
    }
  }
  return window.location.hostname;
};

const getFallbackScheme = () => {
  const apiVal = import.meta.env.VITE_API_URL;
  if (apiVal) {
    try {
      const url = new URL(apiVal);
      return url.protocol === 'https:' ? 'https' : 'http';
    } catch {}
  }
  return 'http';
};

const getFallbackPort = (schemeVal: string) => {
  if (import.meta.env.VITE_REVERB_PORT) {
    return parseInt(import.meta.env.VITE_REVERB_PORT);
  }
  const apiVal = import.meta.env.VITE_API_URL;
  if (apiVal) {
    try {
      const url = new URL(apiVal);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        return url.protocol === 'https:' ? 443 : 80;
      }
    } catch {}
  }
  return 8080;
};

const host = import.meta.env.VITE_REVERB_HOST || getFallbackHost();
const scheme = import.meta.env.VITE_REVERB_SCHEME || getFallbackScheme();
const port = getFallbackPort(scheme);

// Echo client instance helper
const getEchoClient = () => {
  if (typeof window === 'undefined') return null;

  return new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY || 'criclab_key',
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel: any) => {
      return {
        authorize: (socketId: string, callback: any) => {
          api.post('/broadcasting/auth', {
            socket_id: socketId,
            channel_name: channel.name,
          })
          .then((response) => {
            callback(false, response.data);
          })
          .catch((error) => {
            callback(true, error);
          });
        },
      };
    },
  });
};

export const echoClient = typeof window !== 'undefined' ? getEchoClient() : null;

// Helper function to recreate or update the Echo auth token (e.g. after login) - Kept for compatibility but now it's a no-op as Axios interceptors handle the token dynamically
export const updateEchoAuth = () => {
  // Axios interceptors automatically attach the correct token on every auth request, so this is no longer required.
};
