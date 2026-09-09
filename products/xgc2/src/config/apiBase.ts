import { DEFAULT_BROWSER_ORIGIN } from './urls';

const currentOrigin = globalThis.location?.origin ?? DEFAULT_BROWSER_ORIGIN;
const rawApiBase = import.meta.env.VITE_API_BASE || `${currentOrigin}/api`;
const configuredTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS);

export const API_BASE = new URL(rawApiBase,currentOrigin).toString().replace(/\/+$/, '');
export const REQUEST_TIMEOUT_MS = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 8000;
