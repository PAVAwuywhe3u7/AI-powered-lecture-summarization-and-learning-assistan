import axios from "axios";

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const runtimeHostBaseUrl =
  typeof window !== "undefined" && window.location?.hostname
    ? `http://${window.location.hostname}:8000`
    : "";

const apiBaseCandidates = Array.from(
  new Set(
    [configuredBaseUrl, runtimeHostBaseUrl, "http://127.0.0.1:8000", "http://localhost:8000"].filter(
      Boolean,
    ),
  ),
);

let activeBaseUrl = apiBaseCandidates[0] || "http://127.0.0.1:8000";
let authToken = "";

const apiClient = axios.create({
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const nextConfig = config;
  nextConfig.baseURL = activeBaseUrl;
  if (authToken) {
    nextConfig.headers = nextConfig.headers || {};
    nextConfig.headers.Authorization = `Bearer ${authToken}`;
  }
  return nextConfig;
});

function isNetworkOnlyError(error) {
  return axios.isAxiosError(error) && !error.response;
}

async function requestWithFallback(executor, allowFallback = true) {
  const candidates = allowFallback
    ? [activeBaseUrl, ...apiBaseCandidates.filter((item) => item !== activeBaseUrl)]
    : [activeBaseUrl];

  let lastError;

  for (const baseUrl of candidates) {
    activeBaseUrl = baseUrl;
    try {
      return await executor();
    } catch (error) {
      lastError = error;
      if (isNetworkOnlyError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export function getActiveApiBaseUrl() {
  return activeBaseUrl;
}

export function setAuthToken(token) {
  authToken = (token || "").trim();
}

export async function checkApiHealth() {
  const response = await requestWithFallback(() => apiClient.get("/health"), true);
  return response.data;
}

export async function authRegister(payload) {
  const response = await requestWithFallback(
    () => apiClient.post("/auth/register", payload),
    true,
  );
  return response.data;
}

export async function authLogin(payload) {
  const response = await requestWithFallback(
    () => apiClient.post("/auth/login", payload),
    true,
  );
  return response.data;
}

export async function fetchAuthMe() {
  const response = await requestWithFallback(() => apiClient.get("/auth/me"), true);
  return response.data;
}

export async function extractCaptions(payload) {
  const response = await requestWithFallback(() => apiClient.post("/extract_captions", payload), true);
  return response.data;
}

export async function fetchVideoMeta(payload) {
  const response = await requestWithFallback(() => apiClient.post("/video_meta", payload), true);
  return response.data;
}

export async function summarizeTranscript(payload) {
  const response = await requestWithFallback(() => apiClient.post("/summarize", payload), true);
  return response.data;
}

export async function chatWithSummary(payload) {
  const response = await requestWithFallback(() => apiClient.post("/chat", payload), true);
  return response.data;
}

export async function solverChat(payload) {
  const response = await requestWithFallback(() => apiClient.post("/solver_chat", payload), true);
  return response.data;
}

export async function generateMcq(payload) {
  const response = await requestWithFallback(() => apiClient.post("/mcq", payload), true);
  return response.data;
}

export async function downloadPdf(sessionId) {
  const response = await requestWithFallback(
    () =>
      apiClient.get("/pdf", {
        params: { session_id: sessionId },
        responseType: "blob",
      }),
    true,
  );

  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `edu-simplify-${sessionId.slice(0, 8)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function getErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return `Unable to reach API server at ${activeBaseUrl}. Ensure backend is running on port 8000 and CORS is configured for your frontend origin.`;
    }

    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => item?.msg || item?.message || JSON.stringify(item))
        .join("; ");
    }

    return (
      error.response?.data?.message ||
      error.message ||
      "Request failed"
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error occurred";
}

export default apiClient;
