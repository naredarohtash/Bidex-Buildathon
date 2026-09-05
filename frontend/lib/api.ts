// lib/api.ts
import { toast } from "sonner";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface FetchOptions<T> {
  url: string;
  method?: HttpMethod;
  body?: Record<string, any> | FormData | null;
  headers?: HeadersInit;
  params?: Record<string, string | number | boolean>;
  successMessage?: string | ((data: T) => string);
  errorMessage?: string;
  silent?: boolean;
  silentSuccess?: boolean;
  /**
   * Suppress ONLY the "Loading..." toast (spinner) while still surfacing
   * success/error toasts. Use on optimistic hot paths (e.g. placing a trade)
   * where the UI already updates instantly and a spinner must never flash.
   */
  silentLoading?: boolean;
  timeout?: number;
}

interface FetchResponse<T> {
  data: T | null;
  error: string | null;
  validationErrors?: Record<string, any>;
}

interface ApiError {
  message: string;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || 4000;

  if (typeof window !== "undefined") {
    // Client-side: use explicit backend URL override if set, otherwise use current window origin
    // Next.js rewrites will proxy all /api/* requests to backend port 4000 automatically
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      return backendUrl;
    }
    return window.location.origin;
  }

  // Server-side
  return `http://localhost:${backendPort}`;
}

export function fileToBase64(file: Blob): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob)) {
      reject(new Error("The provided value is not a Blob or File."));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result);
    };
    reader.onerror = (error) => {
      reject(new Error(`FileReader error: ${error}`));
    };
    reader.readAsDataURL(file);
  });
}

export async function $fetch<T = any>({
  url,
  method = "GET",
  body = null,
  headers = {},
  params = {},
  successMessage = "Success",
  errorMessage = "Something went wrong",
  silent = false,
  silentSuccess = false,
  silentLoading = false,
  timeout = 10000,
}: FetchOptions<T>): Promise<FetchResponse<T>> {
  // Delayed loading toast: only surface the "Loading..." spinner if a request is
  // genuinely slow. Fast requests (the norm) finish before the timer fires, so
  // nothing ever flashes — "zero buffering". `silent`/`silentLoading` opt out.
  let toastId: string | number | null = null;
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;
  const clearLoading = () => {
    if (loadingTimer !== null) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    if (toastId !== null) {
      toast.dismiss(toastId);
      toastId = null;
    }
  };
  if (!silent && !silentLoading) {
    loadingTimer = setTimeout(() => {
      toastId = toast.loading("Loading...");
    }, 350);
  }

  // Check if body is FormData
  const isFormData = body instanceof FormData;
  
  // Don't set Content-Type for FormData, let browser set it with boundary
  const defaultHeaders: HeadersInit = isFormData ? {
    ...headers,
  } : {
    "Content-Type": "application/json",
    ...headers,
  };

  let urlWithQuery = url;

  try {
    // Construct full URL with proper base URL
    const baseUrl = getApiBaseUrl();
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;


    // Handle query parameters
    if (Object.keys(params).length > 0) {
      const urlObj = new URL(fullUrl);
      Object.entries(params).forEach(([key, value]) => {
        urlObj.searchParams.set(key, String(value));
      });
      urlWithQuery = urlObj.toString();
    } else {
      urlWithQuery = fullUrl;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: defaultHeaders,
      credentials: "include",
      body: isFormData ? body : (body ? JSON.stringify(body) : null),
      signal: (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) ? AbortSignal.timeout(timeout) : undefined,
    };

    const response = await fetch(urlWithQuery, fetchOptions);
    clearLoading();

    // Handle response parsing more safely
    let data: T | ApiError | null = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          // For non-JSON responses (like 404 "Not Found"), handle gracefully
          const isNotFoundError = responseText.includes("Not Found") || response.status === 404;
          if (isNotFoundError) {
            clearLoading();
            return {
              data: null,
              error: "Resource not found",
            };
          }
          
          console.warn("Failed to parse response as JSON:", parseError);
          clearLoading();
          if (!silent) toast.error(errorMessage);
          return {
            data: null,
            error: "Invalid response format",
          };
        }
      } else {
        // Handle empty response
        if (!response.ok) {
          clearLoading();
          if (!silent) toast.error(errorMessage);
          return {
            data: null,
            error: `Request failed with status ${response.status}`,
          };
        }
        // Empty response but status is OK
        return { data: null, error: null };
      }
    } catch (parseError) {
      console.warn("Failed to read response:", parseError);
      clearLoading();
      if (!silent) toast.error(errorMessage);
      return {
        data: null,
        error: "Failed to read response",
      };
    }

    if (response.ok) {
      // Check if the response data indicates an error even though status is 2xx
      if (data && typeof data === "object") {
        const d = data as any;
        
        // Debug logging for statusCode detection
        if (process.env.NODE_ENV === "development" && d.statusCode) {
          console.log("Response contains statusCode:", d.statusCode, "Type:", typeof d.statusCode, "Number:", Number(d.statusCode));
        }
        
        // Check for status code in response body (new error format)
        if (d.statusCode && Number(d.statusCode) >= 400) {
          console.log("Detected error statusCode in response body, calling handleBodyIndicatedError");
          return handleBodyIndicatedError(d, silent, errorMessage);
        }
        // Legacy error format check (includes Rust backend {"error": "..."} format)
        if (d.success === false || d.error || d.errors) {
          console.log("Detected legacy error format, calling handleBodyIndicatedError");
          return handleBodyIndicatedError(d, silent, errorMessage);
        }
      }

      // Otherwise treat as success
      handleSuccess(data as T, successMessage, silent, silentSuccess);
      return { data: data as T, error: null };
    } else {
      // Non-2xx status, standard error handling
      return await handleError<T>(response, data, silent, errorMessage);
    }
  } catch (error: any) {
    clearLoading();
    return handleNetworkError(error, silent, null);
  } finally {
    // Safety net: guarantee the pending/shown loading toast is always cleared,
    // no matter which return path executed above.
    clearLoading();
  }
}

function handleSuccess<T>(
  data: T,
  successMessage: string | ((data: T) => string),
  silent: boolean,
  silentSuccess: boolean
) {
  if (silent || silentSuccess) return;
  let messageToShow = "Success";
  if (typeof successMessage === "function") {
    messageToShow = successMessage(data);
  } else {
    messageToShow = successMessage;
  }

  if (
    messageToShow === "Success" &&
    data &&
    typeof data === "object" &&
    (data as any).message
  ) {
    messageToShow = (data as any).message;
  }

  toast.success(messageToShow);
}

function handleBodyIndicatedError<T>(
  data: any,
  silent: boolean,
  errorMessage: string
): FetchResponse<T> {
  // Get message from data, prioritizing the message field, then error field
  const message = data.message || data.error || errorMessage;

  // Debug logging to help diagnose toast issues
  if (process.env.NODE_ENV === "development") {
    console.log("handleBodyIndicatedError called:", { data, silent, message });
  }

  if (
    typeof window !== "undefined" &&
    data.statusCode === 403 &&
    (data.licenseRequired === true || message?.toLowerCase().includes("license"))
  ) {
    // Only redirect if we're in admin area
    if (window.location.pathname.includes("/admin")) {
      // Extract locale from path (e.g., /en/admin -> en)
      const pathParts = window.location.pathname.split("/");
      const locale = pathParts[1] || "en";

      // Build license page URL with product info if available
      let licensePagePath = `/${locale}/admin/system/license`;
      const queryParams: string[] = [];

      if (data.productId) {
        queryParams.push(`productId=${encodeURIComponent(data.productId)}`);
      }

      // Add return path to current page
      queryParams.push(`return=${encodeURIComponent(window.location.pathname)}`);

      // Add flag to indicate this is from an actual license failure (prevents redirect loop)
      queryParams.push("needsActivation=true");

      if (queryParams.length > 0) {
        licensePagePath += `?${queryParams.join("&")}`;
      }

      // Don't redirect if already on license page
      if (!window.location.pathname.includes("/admin/system/license")) {
        window.location.href = licensePagePath;
        return { data: null, error: message };
      }
    }
  }

  // Check if the response already contains validationErrors
  if (data.validationErrors) {
    if (!silent) {
      console.log("Showing validation error toast");
      toast.error("Validation failed. Please check the required fields.");
    }
    return {
      data: null,
      error: message,
      validationErrors: data.validationErrors,
    };
  }
  
  const parsedValidation = attemptParseValidationErrors(message);
  if (parsedValidation) {
    if (!silent) {
      console.log("Showing validation error toast");
      // Show the actual error message instead of generic "Validation error"
      toast.error(message);
    }
    return {
      data: null,
      error: message,
      validationErrors: parsedValidation,
    };
  }

  if (!silent) {
    console.log("Showing error toast:", message);
    toast.error(message);
  }
  return { data: null, error: message };
}

async function handleError<T>(
  response: Response,
  data: any,
  silent: boolean,
  errorMessage: string
): Promise<FetchResponse<T>> {
  // First check if data contains a status code (new error format)
  if (data && typeof data === "object" && data.statusCode && Number(data.statusCode) >= 400) {
    const message = data.message || data.error || errorMessage;

    // Check for license error and redirect to activation page
    if (
      typeof window !== "undefined" &&
      (response.status === 403 || data.statusCode === 403) &&
      (data.licenseRequired === true || message?.toLowerCase().includes("license"))
    ) {
      // Only redirect if we're in admin area
      if (window.location.pathname.includes("/admin")) {
        const pathParts = window.location.pathname.split("/");
        const locale = pathParts[1] || "en";

        let licensePagePath = `/${locale}/admin/system/license`;
        const queryParams: string[] = [];

        if (data.productId) {
          queryParams.push(`productId=${encodeURIComponent(data.productId)}`);
        }

        queryParams.push(`return=${encodeURIComponent(window.location.pathname)}`);

        // Add flag to indicate this is from an actual license failure (prevents redirect loop)
        queryParams.push("needsActivation=true");

        if (queryParams.length > 0) {
          licensePagePath += `?${queryParams.join("&")}`;
        }

        if (!window.location.pathname.includes("/admin/system/license")) {
          window.location.href = licensePagePath;
          return { data: null, error: message };
        }
      }
    }

    // Check if the response already contains validationErrors
    if (data.validationErrors) {
      if (!silent) toast.error("Validation failed. Please check the required fields.");
      return {
        data: null,
        error: message,
        validationErrors: data.validationErrors,
      };
    }

    const parsedValidation = attemptParseValidationErrors(message);
    if (parsedValidation) {
      // Show the actual error message instead of generic "Validation error"
      if (!silent) toast.error(message);
      return {
        data: null,
        error: message,
        validationErrors: parsedValidation,
      };
    }
    if (!silent) toast.error(message);
    return { data: null, error: message };
  }

  // Check for license error in non-2xx responses
  if (
    typeof window !== "undefined" &&
    response.status === 403 &&
    data &&
    (data.licenseRequired === true || data.message?.includes("license"))
  ) {
    if (window.location.pathname.includes("/admin")) {
      const pathParts = window.location.pathname.split("/");
      const locale = pathParts[1] || "en";

      let licensePagePath = `/${locale}/admin/system/license`;
      const queryParams: string[] = [];

      if (data.productId) {
        queryParams.push(`productId=${encodeURIComponent(data.productId)}`);
      }

      queryParams.push(`return=${encodeURIComponent(window.location.pathname)}`);

      if (queryParams.length > 0) {
        licensePagePath += `?${queryParams.join("&")}`;
      }

      if (!window.location.pathname.includes("/admin/system/license")) {
        window.location.href = licensePagePath;
        return { data: null, error: data.message || errorMessage };
      }
    }
  }

  // Fallback to legacy error handling
  const message = (data && (data.message || data.error)) || response.statusText || errorMessage;
  const parsedValidation = attemptParseValidationErrors(message);
  if (parsedValidation) {
    // Show the actual error message instead of generic "Validation error"
    if (!silent) toast.error(message);
    return {
      data: null,
      error: message,
      validationErrors: parsedValidation,
    };
  }

  if (!silent) toast.error(message);
  return { data: null, error: message };
}

function attemptParseValidationErrors(
  message: string
): Record<string, any> | null {
  if (!message) return null;

  // Invalid request body scenario
  if (message.startsWith("Invalid request body:")) {
    const cleanMessage = message.replace("Invalid request body:", "").trim();
    try {
      const errorObjectRaw = JSON.parse(cleanMessage);
      return parseDotNotatedJsonToNestedObject(errorObjectRaw);
    } catch {
      return null;
    }
  }

  // Generic validation error lines
  if (message.includes("Validation error:")) {
    return parseValidationError(message);
  }

  return null;
}

function parseDotNotatedJsonToNestedObject(
  errorObjectRaw: Record<string, any>
) {
  const nestedErrors: Record<string, any> = {};

  Object.entries(errorObjectRaw).forEach(([key, value]) => {
    const path = key.split(".");
    path.reduce((acc, part, index) => {
      if (index === path.length - 1) {
        acc[part] = Array.isArray(value) ? value[0] : value;
      } else {
        acc[part] = acc[part] || {};
      }
      return acc[part];
    }, nestedErrors);
  });

  return nestedErrors;
}

function parseValidationError(errorMessage: string) {
  const errorLines = errorMessage.split("\n");
  const errors: Record<string, string> = {};

  errorLines.forEach((line) => {
    const cleanLine = line.replace("Validation error: ", "");
    const firstColonIndex = cleanLine.indexOf(":");
    if (firstColonIndex !== -1) {
      const key = cleanLine.substring(0, firstColonIndex).trim();
      const msg = cleanLine.substring(firstColonIndex + 1).trim();
      errors[key] = msg;
    }
  });

  return errors;
}

function handleNetworkError(
  error: any,
  silent: boolean,
  toastId: string | number | null
): FetchResponse<any> {
  // Check if this is a connection reset/abort error (common during navigation or server restarts)
  // Note: fetch errors have the code on error.cause, not directly on error
  const errorCode = error?.code || error?.cause?.code;
  const isConnectionError =
    errorCode === "ECONNRESET" ||
    errorCode === "ECONNREFUSED" ||
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.message?.includes("aborted") ||
    error?.message?.includes("fetch failed") ||
    error?.message?.includes("network");

  // Only log non-connection errors to avoid log spam
  if (!isConnectionError) {
    console.error("Fetch error:", error);
  }

  if (!silent) {
    if (toastId !== null) {
      toast.dismiss(toastId);
    }
    // Don't show toast for connection reset errors (user navigated away or connection dropped)
    if (!isConnectionError) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Network error: ${message}. Please try again later.`);
    } else if (error?.name === "TimeoutError" || error?.message?.includes("aborted")) {
      toast.error("Request timed out. Please try again.");
    }
  }
  return {
    data: null,
    error: error instanceof Error ? error.message : "Unknown error",
  };
}

export async function $serverFetch<T = any>(
  context,
  { url, method = "GET", body = null, headers = {} }: FetchOptions<T>
): Promise<FetchResponse<T>> {
  // Use the same API base URL logic for server-side calls
  const baseUrl = getApiBaseUrl();
  const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

  const defaultHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...headers,
  };

  // Use AbortController with timeout to prevent hanging connections
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for server-side

  const fetchOptions: RequestInit = {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : null,
    signal: controller.signal,
  };

  try {
    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeoutId);

    // Handle response parsing more safely
    let data: T | null = null;
    try {
      const responseText = await response.text();
      if (responseText) {
        data = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.warn("Failed to parse server response as JSON:", parseError);
      return { data: null, error: "Invalid server response format" };
    }

    if (!response.ok) {
      const errorMessage =
        (data as any)?.message || response.statusText || "Server Error";
      return { data: null, error: errorMessage };
    }

    // Check for status code in response body (new error format)
    if (data && typeof data === "object") {
      const d = data as any;
      if (d.statusCode && Number(d.statusCode) >= 400) {
        const errorMessage = d.message || "Server Error";
        return { data: null, error: errorMessage };
      }
    }

    return { data, error: null };
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Silently handle connection errors (ECONNRESET, ECONNREFUSED, abort)
    // Note: fetch errors have the code on error.cause, not directly on error
    const errorCode = error?.code || error?.cause?.code;
    const isConnectionError =
      errorCode === "ECONNRESET" ||
      errorCode === "ECONNREFUSED" ||
      error?.name === "AbortError" ||
      error?.message?.includes("aborted") ||
      error?.message?.includes("fetch failed");

    if (!isConnectionError) {
      console.error("Server-side Fetch error:", error);
    }

    return { data: null, error: "Server Error" };
  }
}

export default $fetch;
