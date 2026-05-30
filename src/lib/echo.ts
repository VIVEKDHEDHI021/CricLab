import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import api from '@/lib/api';

if (typeof window !== 'undefined') {
  (window as any).Pusher = Pusher;
}

const host = import.meta.env.VITE_REVERB_HOST || (typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1');
const port = import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 8080;
const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';

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
