import axios from 'axios';

export const desktopServerStorageKey = "veloce.desktop.server_url";
export const defaultDesktopServerURL = "http://localhost:12789";

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
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
