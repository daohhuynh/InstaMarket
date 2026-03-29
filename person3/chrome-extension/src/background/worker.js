// ============================================================
// BACKGROUND WORKER — cross-origin JSON fetch for content scripts
// ============================================================

const IM_FETCH_JSON_MESSAGE = "IM_FETCH_JSON";
const IM_FETCH_TEXT_MESSAGE = "IM_FETCH_TEXT";
const IM_OPEN_TAB_MESSAGE = "IM_OPEN_TAB";
const DEFAULT_TIMEOUT_MS = 12000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === IM_FETCH_JSON_MESSAGE) {
    handleJsonFetchMessage(message)
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          type: IM_FETCH_JSON_MESSAGE,
          ok: false,
          status: 0,
          json: null,
          error: error instanceof Error ? error.message : "Unknown fetch error"
        });
      });

    return true;
  }

  if (message.type === IM_FETCH_TEXT_MESSAGE) {
    handleTextFetchMessage(message)
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          type: IM_FETCH_TEXT_MESSAGE,
          ok: false,
          status: 0,
          text: "",
          error: error instanceof Error ? error.message : "Unknown fetch error"
        });
      });

    return true;
  }

  if (message.type === IM_OPEN_TAB_MESSAGE) {
    const url = normalizeUrl(message.url);
    if (!url) {
      sendResponse({ type: IM_OPEN_TAB_MESSAGE, ok: false, error: "Invalid URL" });
      return;
    }

    chrome.tabs.create({ url, active: true }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          type: IM_OPEN_TAB_MESSAGE,
          ok: false,
          error: chrome.runtime.lastError.message || "Tab creation failed"
        });
        return;
      }
      sendResponse({ type: IM_OPEN_TAB_MESSAGE, ok: true });
    });

    return true;
  }
});

async function handleJsonFetchMessage(message) {
  const request = (message && typeof message.request === "object") ? message.request : {};
  const url = normalizeUrl(request.url);
  if (!url) {
    return {
      type: IM_FETCH_JSON_MESSAGE,
      ok: false,
      status: 0,
      json: null,
      error: "Invalid URL"
    };
  }

  const method = normalizeMethod(request.method);
  const timeoutMs = clampNumber(Number(request.timeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const headers = normalizeHeaders(request.headers);

  const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const init = {
      method,
      headers,
      credentials: "omit",
      signal: controller?.signal
    };

    if (method === "GET") {
      init.cache = "no-store";
    }

    if (typeof request.body === "string" && method !== "GET" && method !== "HEAD") {
      init.body = request.body;
    }

    const response = await fetch(url, init);
    const text = await response.text();
    const parsed = tryParseJson(text);

    return {
      type: IM_FETCH_JSON_MESSAGE,
      ok: response.ok,
      status: response.status,
      json: parsed,
      error: response.ok ? "" : `HTTP ${response.status}`
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function handleTextFetchMessage(message) {
  const request = (message && typeof message.request === "object") ? message.request : {};
  const url = normalizeUrl(request.url);
  if (!url) {
    return {
      type: IM_FETCH_TEXT_MESSAGE,
      ok: false,
      status: 0,
      text: "",
      error: "Invalid URL"
    };
  }

  const method = normalizeMethod(request.method);
  const timeoutMs = clampNumber(Number(request.timeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const headers = normalizeHeaders(request.headers);

  const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const init = {
      method,
      headers,
      credentials: "omit",
      signal: controller?.signal
    };

    if (method === "GET") {
      init.cache = "no-store";
    }

    if (typeof request.body === "string" && method !== "GET" && method !== "HEAD") {
      init.body = request.body;
    }

    const response = await fetch(url, init);
    const text = await response.text();

    return {
      type: IM_FETCH_TEXT_MESSAGE,
      ok: response.ok,
      status: response.status,
      text,
      error: response.ok ? "" : `HTTP ${response.status}`
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeMethod(value) {
  const method = String(value || "GET").toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method) ? method : "GET";
}

function normalizeHeaders(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  const headers = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof key !== "string") continue;
    if (typeof headerValue !== "string") continue;
    headers[key] = headerValue;
  }
  return headers;
}

function tryParseJson(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
