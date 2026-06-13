import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Dedicated API Proxy handler to route /api/* calls to Laravel backend with buffering & timeouts
async function proxyApiRequest(request: Request, env: any): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  
  // Resolve target API Base URL: checks env.VITE_API_URL or defaults to production
  const backendBaseUrl = env?.VITE_API_URL || "https://criclab-api01.onrender.com/api";
  
  const cleanBase = backendBaseUrl.replace(/\/$/, "");
  const cleanPath = url.pathname.replace(/^\/api/, "");
  const targetUrl = `${cleanBase}${cleanPath}${url.search}`;
  
  console.log(`[CF Worker] [${request.method}] Incoming API Request: ${url.pathname}`);
  console.log(`[CF Worker] Forwarding to: ${targetUrl}`);

  // Handle CORS preflight OPTIONS requests directly at the edge to avoid preflight overhead/failures
  if (request.method === "OPTIONS") {
    console.log(`[CF Worker] Handling preflight OPTIONS request for ${url.pathname}`);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, X-Requested-With",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Buffer incoming request body into an ArrayBuffer for non-GET requests.
  // This resolves the classic CF Worker hanging issue where forwarding a raw request.body stream stalls.
  let body: ArrayBuffer | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.clone().arrayBuffer();
      console.log(`[CF Worker] Buffered request body. Size: ${body.byteLength} bytes`);
    } catch (e: any) {
      console.error(`[CF Worker] Request body buffering failed: ${e.message}`);
    }
  }

  // Clone headers and exclude host / CF headers that might cause routing loops or backend confusion
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() === "host") continue;
    headers.set(key, value);
  }

  // Pass Client IP in headers
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    console.log(`[CF Worker] Backend response: ${response.status} for ${url.pathname} in ${duration}ms`);

    // Prepare response headers, extending/overriding CORS headers to prevent cross-origin blocks
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", request.headers.get("origin") || "*");
    responseHeaders.set("Access-Control-Allow-Credentials", "true");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-Requested-With");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (error.name === "AbortError") {
      console.error(`[CF Worker] API Request to ${targetUrl} timed out after ${duration}ms`);
      return new Response(
        JSON.stringify({
          message: "Gateway Timeout: The backend API did not respond within 60 seconds.",
          error: "TIMEOUT",
        }),
        {
          status: 544,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
            "Access-Control-Allow-Credentials": "true",
          },
        }
      );
    }

    console.error(`[CF Worker] API Request to ${targetUrl} failed after ${duration}ms: ${error.message}`);
    return new Response(
      JSON.stringify({
        message: "Network Error: Could not connect to the backend API.",
        error: error.message,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
          "Access-Control-Allow-Credentials": "true",
        },
      }
    );
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // If the path starts with /api, route it through our API Proxy handler
    if (url.pathname.startsWith("/api")) {
      return await proxyApiRequest(request, env);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
