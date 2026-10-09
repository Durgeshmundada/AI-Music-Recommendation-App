import axios from 'axios';

// Production builds use their own host unless an explicit public API is supplied.
const envBaseURL = import.meta.env.PROD ? import.meta.env.VITE_PUBLIC_API_URL : import.meta.env.VITE_API_URL;
const runtimeBaseURL = `${window.location.origin.replace(/\/$/, '')}/api`;
const devFallbackBaseURL = 'http://localhost:5002/api';
const baseURL = envBaseURL || (import.meta.env.DEV ? devFallbackBaseURL : runtimeBaseURL);

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 20000,
});

apiClient.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('ai-music-auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // ignore
  }
  return config;
});

function isTransientError(error) {
  if (!error.response) return true;
  return [408, 429, 500, 502, 503, 504].includes(error.response.status);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const method = String(config.method || 'get').toLowerCase();
    const canRetryMethod = ['get', 'head', 'options'].includes(method);
    const retryCount = config.__retryCount || 0;
    const maxRetries = 2;

    if (!axios.isCancel(error) && canRetryMethod && isTransientError(error) && retryCount < maxRetries) {
      config.__retryCount = retryCount + 1;
      const delayMs = 250 * (2 ** retryCount);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return apiClient(config);
    }

    return Promise.reject(error);
  }
);
