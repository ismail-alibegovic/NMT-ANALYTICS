import axios, { AxiosInstance, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

const isDev = import.meta.env.DEV;

// 1) Ensure baseURL is exactly "/api" in dev by default.
let baseURL = '/api';

if (import.meta.env.VITE_API_URL) {
  let url = import.meta.env.VITE_API_URL;
  // Remove trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // If it matches the backend port directly, use '/api' to ensure we go through Vite proxy
  if (url === 'http://localhost:3001') {
    baseURL = '/api';
  } else {
    // For other URLs (e.g. production), use them as is
    baseURL = url;
  }
}

// 3) Helper to join base and path, preventing double slashes and double "/api"
export function joinUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  // Check for potential /api/api duplication
  if (normalizedBase.endsWith('/api') && normalizedPath.startsWith('api/')) {
    return `${normalizedBase}/${normalizedPath.substring(4)}`;
  }

  return `${normalizedBase}/${normalizedPath}`;
}

if (isDev) {
  logger.debugError('[api-client] baseURL:', baseURL);
}

// ============================================================================
// 429 Rate Limit Cooldown Helper
// ============================================================================

let rateLimitCooldownUntil = 0; // Timestamp when cooldown expires

/**
 * Check if we're in a 429 cooldown period
 * @returns true if in cooldown, false if requests are allowed
 */
export function shouldCooldown429(): boolean {
  const now = Date.now();
  if (rateLimitCooldownUntil > now) {
    const remainingSeconds = Math.ceil((rateLimitCooldownUntil - now) / 1000);
    logger.warn(`[api-client] 429 cooldown active for ${remainingSeconds}s`);
    return true;
  }
  return false;
}

/**
 * Set 429 cooldown for 60 seconds
 * Called internally when 429 is detected
 */
function set429Cooldown(): void {
  const cooldownSeconds = 60;
  rateLimitCooldownUntil = Date.now() + (cooldownSeconds * 1000);
  logger.error(`[api-client] 429 detected - cooldown set for ${cooldownSeconds}s`);
}

/**
 * Clear 429 cooldown (e.g., on successful request or logout)
 */
export function clear429Cooldown(): void {
  rateLimitCooldownUntil = 0;
}

// ============================================================================

const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 1) Robustly fix double /api prefix
    const base = config.baseURL || baseURL || '';
    if (base.endsWith('/api') && config.url) {
      if (config.url.startsWith('/api/')) {
        config.url = config.url.substring(4); // Remove "/api"
      } else if (config.url.startsWith('api/')) {
        config.url = config.url.substring(4); // Remove "api/"
      } else if (config.url === '/api' || config.url === 'api') {
        config.url = '/';
      }
    }

    // 2) Attach Auth Token
    let token = localStorage.getItem('nmt_auth_token') || localStorage.getItem('nmt_token');

    // Fallback to Supabase structured storage if needed
    if (!token) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('-auth-token')) {
            const val = localStorage.getItem(key);
            if (val) {
              const parsed = JSON.parse(val);
              if (parsed.access_token) {
                token = parsed.access_token;
                break;
              }
            }
          }
        }
      } catch (e) { /* silent */ }
    }

    if (token) {
      // Ensure we use the latest token and force override any existing header
      config.headers.Authorization = `Bearer ${token}`;
      logger.log(`[api-client] ✅ Token attached (${token.substring(0, 20)}...)`);
    } else {
      logger.warn('[api-client] ⚠️  No token found - request will fail if endpoint requires auth');
    }

    const fullUrl = joinUrl(base, config.url || '');
    logger.log(`[api-client] ${config.method?.toUpperCase()} ${fullUrl}`, {
      hasAuth: !!token,
      headers: config.headers.Authorization ? 'Bearer ***' : 'none'
    });

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // if (isDev) {
    //   console.log('[api-client] Response:', response.status, response.config.method?.toUpperCase(), response.config.url);
    // }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // if (isDev) {
    //   console.error('[api-client] Response error:', {
    //     status: error.response?.status,
    //     url: originalRequest?.url,
    //     message: error.message,
    //   });
    // }

    // Handle 429 Rate Limit - DO NOT RETRY
    if (error.response?.status === 429) {
      logger.error('[api-client] 429 Rate Limit - Request blocked');
      set429Cooldown(); // Set 60-second cooldown
      // Mark as already retried to prevent any retry logic
      if (originalRequest) {
        originalRequest._retry = true;
      }
      // Return immediately without retry - error will be handled by caller
      return Promise.reject(error);
    }

    // Handle 401 (unauthorized = session expired, sign out)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      await supabase.auth.signOut();
      window.dispatchEvent(new CustomEvent('api-auth-error', {
        detail: { message: 'Session expired' }
      }));
      window.location.href = '/auth/signin';
      return Promise.reject(error);
    }
    // Handle 403 (forbidden = role-based access denied) - do NOT sign out, just reject
    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

function normalizeError(error: any): ApiError {
  if (error.response) {
    const data = error.response.data;
    const status = error.response.status;
    let message = 'An error occurred';
    let code = data?.code;

    // Handle 429 Rate Limit with clear message
    if (status === 429) {
      message = 'Authentication rate limit reached. Please wait 60 seconds and refresh.';
      code = 'RATE_LIMIT';
      return { message, status, code };
    }

    // Handle { message: "..." }
    if (data?.message) {
      message = data.message;
    }
    // Handle { error: "..." } or { error: { message: "..." } }
    else if (data?.error) {
      if (typeof data.error === 'string') {
        message = data.error;
      } else if (typeof data.error === 'object' && data.error.message) {
        message = data.error.message;
      }
    }

    return {
      message,
      status,
      code,
    };
  }

  return {
    message: error.message || 'Network error',
    code: 'NETWORK_ERROR',
  };
}

import { dataEvents, EntityType } from './events';

/**
 * Extracts entity name from URL (e.g. /packages/123 -> packages)
 */
function extractEntity(url: string): EntityType | 'all' {
  const parts = url.split('/').filter(Boolean);
  if (parts.length === 0) return 'all';
  // If first part is 'api', take second
  const entity = parts[0] === 'api' ? parts[1] : parts[0];
  return entity as EntityType;
}

export async function get<T = any>(url: string, config?: any): Promise<{ data: T }> {
  try {
    const response = await api.get<T>(url, config);
    return { data: response.data };
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function post<T = any>(url: string, data?: any, config?: any): Promise<{ data: T }> {
  try {
    const response = await api.post<T>(url, data, config);
    dataEvents.emit(extractEntity(url));
    return { data: response.data };
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function patch<T = any>(url: string, data?: any, config?: any): Promise<{ data: T }> {
  try {
    const response = await api.patch<T>(url, data, config);
    dataEvents.emit(extractEntity(url));
    return { data: response.data };
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function del<T = any>(url: string, config?: any): Promise<{ data: T }> {
  try {
    const response = await api.delete<T>(url, config);
    dataEvents.emit(extractEntity(url));
    return { data: response.data };
  } catch (error) {
    throw normalizeError(error);
  }
}

export default api;
