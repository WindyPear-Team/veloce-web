import axios from 'axios';

export const desktopServerStorageKey = "veloce.desktop.server_url";
export const defaultDesktopServerURL = "http://localhost:12789";
const desktopServerTokenPrefix = "veloce.desktop.server_token.";

export const isDesktopTarget = () => import.meta.env.VITE_APP_TARGET === "desktop";

export const normalizeServerURL = (value: string | null | undefined) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return defaultDesktopServerURL;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return defaultDesktopServerURL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return defaultDesktopServerURL;
  }
};

export const getDesktopServerURL = () => {
  if (typeof window === "undefined") {
    return defaultDesktopServerURL;
  }
  return normalizeServerURL(localStorage.getItem(desktopServerStorageKey));
};

export const desktopServerTokenKey = (serverURL = getDesktopServerURL()) => {
  return `${desktopServerTokenPrefix}${encodeURIComponent(normalizeServerURL(serverURL))}`;
};

export const getAuthToken = () => {
  if (typeof window === "undefined") {
    return "";
  }
  if (!isDesktopTarget()) {
    return localStorage.getItem("token") || "";
  }
  return localStorage.getItem(desktopServerTokenKey()) || localStorage.getItem("token") || "";
};

export const setAuthToken = (token: string) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("token", token);
  if (isDesktopTarget()) {
    localStorage.setItem(desktopServerTokenKey(), token);
  }
};

export const clearAuthToken = () => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("token");
  if (isDesktopTarget()) {
    localStorage.removeItem(desktopServerTokenKey());
  }
};

export const setDesktopServerURL = (serverURL: string) => {
  if (typeof window === "undefined") {
    return defaultDesktopServerURL;
  }
  const currentToken = localStorage.getItem("token");
  if (currentToken) {
    localStorage.setItem(desktopServerTokenKey(), currentToken);
  }
  const nextURL = normalizeServerURL(serverURL);
  localStorage.setItem(desktopServerStorageKey, nextURL);
  const nextToken = localStorage.getItem(desktopServerTokenKey(nextURL));
  if (nextToken) {
    localStorage.setItem("token", nextToken);
  } else {
    localStorage.removeItem("token");
  }
  return nextURL;
};

export const apiURL = (pathOrURL: string) => {
  if (/^https?:\/\//i.test(pathOrURL)) {
    return pathOrURL;
  }
  if (!isDesktopTarget()) {
    return pathOrURL;
  }
  const normalizedPath = pathOrURL.startsWith("/") ? pathOrURL : `/${pathOrURL}`;
  return `${getDesktopServerURL()}${normalizedPath}`;
};

const apiBaseURL = () => isDesktopTarget() ? apiURL("/api") : "/api";

const api = axios.create({
  baseURL: apiBaseURL(),
});

export const getAuthLoginURL = (referralCode?: string | null, agreementAccepted = false) => {
  return getOAuthLoginURL("/auth/login", referralCode, agreementAccepted);
};

export const getOAuthLoginURL = (loginURL: string, referralCode?: string | null, agreementAccepted = false) => {
  const code = (referralCode || localStorage.getItem("referral_code") || "").trim();
  const params = new URLSearchParams();
  if (code) {
    params.set("ref", code);
  }
  if (agreementAccepted) {
    params.set("agreement_accepted", "true");
  }
  const query = params.toString();
  const nextLoginURL = query ? `${loginURL}${loginURL.includes("?") ? "&" : "?"}${query}` : loginURL;
  return apiURL(nextLoginURL);
};

// Add a request interceptor to include the JWT token
api.interceptors.request.use((config) => {
  config.baseURL = apiBaseURL();
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
