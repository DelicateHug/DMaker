/**
 * Fetch utility for API calls
 *
 * Provides a wrapper around fetch that automatically includes:
 * - Content-Type header
 * - credentials: 'include'
 *
 * Use this instead of raw fetch() for all API calls.
 */

import { getServerUrlSync } from './http-api-client';

// Server URL - uses shared cached URL from http-api-client
const getServerUrl = (): string => getServerUrlSync();
const DEFAULT_CACHE_MODE: RequestCache = 'no-store';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ApiFetchOptions extends Omit<RequestInit, 'method' | 'headers' | 'body'> {
  /** Additional headers to include */
  headers?: Record<string, string>;
  /** Request body - will be JSON stringified if object */
  body?: unknown;
  /** Skip authentication headers (for public endpoints like /api/health) */
  skipAuth?: boolean;
}

/**
 * Build headers for a request
 */
export function getAuthHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
}

/**
 * Make a fetch request to the API
 *
 * @param endpoint - API endpoint (e.g., '/api/fs/browse')
 * @param method - HTTP method
 * @param options - Additional options
 * @returns Response from fetch
 *
 * @example
 * ```ts
 * // Simple GET
 * const response = await apiFetch('/api/terminal/status', 'GET');
 *
 * // POST with body
 * const response = await apiFetch('/api/fs/browse', 'POST', {
 *   body: { dirPath: '/home/user' }
 * });
 *
 * // With additional headers
 * const response = await apiFetch('/api/terminal/sessions', 'POST', {
 *   headers: { 'X-Terminal-Token': token },
 *   body: { cwd: '/home/user' }
 * });
 * ```
 */
export async function apiFetch(
  endpoint: string,
  method: HttpMethod = 'GET',
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { headers: additionalHeaders, body, skipAuth, cache, ...restOptions } = options;

  const headers = getAuthHeaders(additionalHeaders);

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
    cache: cache ?? DEFAULT_CACHE_MODE,
    ...restOptions,
  };

  if (body !== undefined) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${getServerUrl()}${endpoint}`;
  return fetch(url, fetchOptions);
}

/**
 * Make a GET request
 */
export async function apiGet<T>(
  endpoint: string,
  options: Omit<ApiFetchOptions, 'body'> = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'GET', options);
  return response.json();
}

/**
 * Make a POST request
 */
export async function apiPost<T>(
  endpoint: string,
  body?: unknown,
  options: ApiFetchOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'POST', { ...options, body });
  return response.json();
}

/**
 * Make a PUT request
 */
export async function apiPut<T>(
  endpoint: string,
  body?: unknown,
  options: ApiFetchOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, 'PUT', { ...options, body });
  return response.json();
}

/**
 * Make a DELETE request
 */
export async function apiDelete<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiFetch(endpoint, 'DELETE', options);
  return response.json();
}

/**
 * Make a DELETE request (returns raw response for status checking)
 */
export async function apiDeleteRaw(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  return apiFetch(endpoint, 'DELETE', options);
}

/**
 * Build an image URL for use in <img> tags or CSS background-image
 *
 * @param path - Image path
 * @param projectPath - Project path
 * @param version - Optional cache-busting version
 * @returns Full URL
 */
export function getAuthenticatedImageUrl(
  path: string,
  projectPath: string,
  version?: string | number
): string {
  const serverUrl = getServerUrl();
  const params = new URLSearchParams({
    path,
    projectPath,
  });

  if (version !== undefined) {
    params.set('v', String(version));
  }

  return `${serverUrl}/api/fs/image?${params.toString()}`;
}
