import http from "node:http";
import { ApiError } from "./errors.js";

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return cookies;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value))}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(Number(options.maxAge))}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  } else {
    parts.push("Path=/");
  }
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  return parts.join("; ");
}

function compileRoutePattern(pattern) {
  const clean = pattern === "/" ? "/" : pattern.replace(/\/+$/, "");
  const paramNames = [];
  const regexStr = clean
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return {
    regex: new RegExp(`^${regexStr || "/"}/?$`),
    paramNames,
  };
}

export function createRouter() {
  const stack = [];

  function addRoute(method, pathPattern, ...handlers) {
    stack.push({
      type: "route",
      method: method.toUpperCase(),
      pathPattern,
      handlers: handlers.flat(),
    });
    return router;
  }

  const router = {
    stack,
    use(pathOrFn, ...fns) {
      if (typeof pathOrFn === "function" || ( pathOrFn && Array.isArray(pathOrFn.stack))) {
        const all = [pathOrFn, ...fns];
        for (const item of all) {
          if (item && Array.isArray(item.stack)) {
            stack.push({ type: "router", prefix: "", router: item });
          } else if (typeof item === "function") {
            stack.push({
              type: item.length === 4 ? "errorMiddleware" : "middleware",
              prefix: "",
              fn: item,
            });
          }
        }
      } else if (typeof pathOrFn === "string") {
        const prefix = pathOrFn === "/" ? "" : pathOrFn.replace(/\/+$/, "");
        for (const item of fns) {
          if (item && Array.isArray(item.stack)) {
            stack.push({ type: "router", prefix, router: item });
          } else if (typeof item === "function") {
            stack.push({
              type: item.length === 4 ? "errorMiddleware" : "middleware",
              prefix,
              fn: item,
            });
          }
        }
      }
      return router;
    },
    get: (p, ...h) => addRoute("GET", p, ...h),
    post: (p, ...h) => addRoute("POST", p, ...h),
    patch: (p, ...h) => addRoute("PATCH", p, ...h),
    put: (p, ...h) => addRoute("PUT", p, ...h),
    delete: (p, ...h) => addRoute("DELETE", p, ...h),
    options: (p, ...h) => addRoute("OPTIONS", p, ...h),
  };

  return router;
}

function flattenStack(routerStack, basePrefix = "") {
  const flat = [];
  for (const item of routerStack) {
    if (item.type === "router") {
      const nextPrefix = `${basePrefix}${item.prefix || ""}`;
      flat.push(...flattenStack(item.router.stack, nextPrefix));
    } else if (item.type === "route") {
      const fullPattern =
        `${basePrefix}${item.pathPattern === "/" ? "" : item.pathPattern}` || "/";
      const compiled = compileRoutePattern(fullPattern);
      flat.push({
        type: "route",
        method: item.method,
        fullPattern,
        regex: compiled.regex,
        paramNames: compiled.paramNames,
        handlers: item.handlers,
      });
    } else {
      flat.push({
        ...item,
        prefix: `${basePrefix}${item.prefix || ""}`,
      });
    }
  }
  return flat;
}

export function createApp({ maxBodySizeBytes = 900 * 1024 } = {}) {
  const rootRouter = createRouter();

  async function dispatch(req, res) {
    const entries = flattenStack(rootRouter.stack);
    let idx = 0;
    let currentError = null;
    let routeMatched = false;

    async function next(err) {
      if (err) {
        currentError = err;
      }
      if (res.writableEnded) return;

      while (idx < entries.length) {
        const entry = entries[idx++];

        if (currentError) {
          if (entry.type === "errorMiddleware") {
            try {
              const errToHandle = currentError;
              currentError = null;
              await entry.fn(errToHandle, req, res, next);
              return;
            } catch (handlerErr) {
              currentError = handlerErr;
            }
          }
          continue;
        }

        if (entry.type === "middleware") {
          if (entry.prefix && !req.path.startsWith(entry.prefix)) {
            continue;
          }
          try {
            let downstreamPromise = null;
            const wrappedNext = (mwNextErr) => {
              downstreamPromise = next(mwNextErr);
              return downstreamPromise;
            };
            await entry.fn(req, res, wrappedNext);
            if (downstreamPromise) {
              await downstreamPromise;
            }
            return;
          } catch (mwErr) {
            currentError = mwErr;
            continue;
          }
        }

        if (entry.type === "route") {
          if (entry.method !== req.method) continue;
          const match = entry.regex.exec(req.path);
          if (!match) continue;

          routeMatched = true;
          const params = {};
          entry.paramNames.forEach((name, i) => {
            try {
              params[name] = decodeURIComponent(match[i + 1]);
            } catch {
              params[name] = match[i + 1];
            }
          });
          req.params = params;

          let hIdx = 0;
          const runHandlers = async (routeErr) => {
            if (routeErr) {
              return next(routeErr);
            }
            if (res.writableEnded) return;
            if (hIdx >= entry.handlers.length) {
              return next();
            }
            const handler = entry.handlers[hIdx++];
            try {
              let subPromise = null;
              const wrappedRunNext = (subErr) => {
                subPromise = runHandlers(subErr);
                return subPromise;
              };
              await handler(req, res, wrappedRunNext);
              if (subPromise) {
                await subPromise;
              }
            } catch (hErr) {
              await next(hErr);
            }
          };

          await runHandlers();
          return;
        }
      }

      if (!res.writableEnded) {
        if (!currentError && !routeMatched) {
          currentError = ApiError.notFound(
            `Endpoint bulunamadı: ${req.method} ${req.path}`
          );
          // Error middleware'leri tekrar tara
          for (const entry of entries) {
            if (entry.type === "errorMiddleware") {
              await entry.fn(currentError, req, res, () => {});
              if (res.writableEnded) return;
            }
          }
        }
        if (currentError && !res.writableEnded) {
          res.status(currentError.statusCode || 500).json({
            success: false,
            error: {
              code: currentError.code || "INTERNAL_ERROR",
              message: currentError.message || "Sunucu hatası.",
            },
          });
        }
      }
    }

    await next();
  }

  /**
   * Programatik HTTP isteği çalıştırıcı (Testler ve proses-içi çağrılar için).
   */
  async function inject({
    method = "GET",
    url = "/",
    headers = {},
    body = undefined,
    ip = "127.0.0.1",
  } = {}) {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers || {})) {
      normalizedHeaders[k.toLowerCase()] = String(v);
    }

    const parsedUrl = new URL(url, "http://localhost");
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    let rawBodySize = 0;
    let parsedBody = body;

    if (typeof body === "string") {
      rawBodySize = Buffer.byteLength(body, "utf8");
      if (rawBodySize > maxBodySizeBytes) {
        parsedBody = undefined;
      } else if (body.trim()) {
        try {
          parsedBody = JSON.parse(body);
        } catch {
          parsedBody = undefined;
        }
      }
    } else if (body !== undefined && body !== null) {
      const serialized = JSON.stringify(body);
      rawBodySize = Buffer.byteLength(serialized, "utf8");
    }

    const req = {
      method: method.toUpperCase(),
      url,
      originalUrl: url,
      path: parsedUrl.pathname,
      query,
      params: {},
      headers: normalizedHeaders,
      cookies: parseCookies(normalizedHeaders.cookie),
      body: parsedBody || {},
      rawBodySize,
      bodyTooLarge: rawBodySize > maxBodySizeBytes,
      ip,
      get(headerName) {
        return normalizedHeaders[String(headerName).toLowerCase()];
      },
    };

    const resHeaders = {};
    const setCookies = [];
    let statusCode = 200;
    let responseBody = null;
    let writableEnded = false;

    const res = {
      get statusCode() {
        return statusCode;
      },
      set statusCode(val) {
        statusCode = Number(val);
      },
      get writableEnded() {
        return writableEnded;
      },
      status(code) {
        statusCode = Number(code);
        return res;
      },
      setHeader(name, value) {
        resHeaders[String(name).toLowerCase()] = value;
        return res;
      },
      getHeader(name) {
        return resHeaders[String(name).toLowerCase()];
      },
      cookie(name, value, options = {}) {
        const cookieStr = serializeCookie(name, value, options);
        setCookies.push(cookieStr);
        resHeaders["set-cookie"] = setCookies;
        return res;
      },
      clearCookie(name, options = {}) {
        return res.cookie(name, "", { ...options, maxAge: 0 });
      },
      json(payload) {
        resHeaders["content-type"] = "application/json; charset=utf-8";
        responseBody = payload;
        writableEnded = true;
        return res;
      },
      send(payload) {
        responseBody = payload;
        writableEnded = true;
        return res;
      },
      end(payload = null) {
        if (payload !== null) responseBody = payload;
        writableEnded = true;
        return res;
      },
    };

    if (req.bodyTooLarge) {
      const err = ApiError.payloadTooLarge(
        `İstek gövdesi boyutu maksimum ${Math.round(maxBodySizeBytes / 1024)} KB sınırını aşıyor.`
      );
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    } else {
      await dispatch(req, res);
    }

    return {
      status: statusCode,
      headers: resHeaders,
      cookies: setCookies,
      body: responseBody,
    };
  }

  /**
   * Gerçek Node.js http.IncomingMessage / http.ServerResponse işleyicisi
   */
  function httpHandler(nodeReq, nodeRes) {
    const chunks = [];
    let receivedBytes = 0;
    let aborted = false;

    nodeReq.on("data", (chunk) => {
      if (aborted) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBodySizeBytes) {
        aborted = true;
        nodeRes.statusCode = 413;
        nodeRes.setHeader("content-type", "application/json; charset=utf-8");
        nodeRes.end(
          JSON.stringify({
            success: false,
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "İstek boyutu izin verilen sınırı aşıyor.",
            },
          })
        );
        return;
      }
      chunks.push(chunk);
    });

    nodeReq.on("end", async () => {
      if (aborted) return;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      let parsedBody = {};
      if (rawBody.trim()) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          nodeRes.statusCode = 400;
          nodeRes.setHeader("content-type", "application/json; charset=utf-8");
          nodeRes.end(
            JSON.stringify({
              success: false,
              error: {
                code: "INVALID_JSON",
                message: "İstek gövdesi geçerli bir JSON formatında değil.",
              },
            })
          );
          return;
        }
      }

      const result = await inject({
        method: nodeReq.method,
        url: nodeReq.url,
        headers: nodeReq.headers,
        body: parsedBody,
        ip: nodeReq.socket?.remoteAddress || "127.0.0.1",
      });

      nodeRes.statusCode = result.status;
      for (const [k, v] of Object.entries(result.headers)) {
        nodeRes.setHeader(k, v);
      }

      if (result.body === null || result.body === undefined) {
        nodeRes.end();
      } else if (typeof result.body === "object") {
        nodeRes.end(JSON.stringify(result.body));
      } else {
        nodeRes.end(String(result.body));
      }
    });
  }

  httpHandler.use = (...args) => {
    rootRouter.use(...args);
    return httpHandler;
  };
  httpHandler.get = (...args) => {
    rootRouter.get(...args);
    return httpHandler;
  };
  httpHandler.post = (...args) => {
    rootRouter.post(...args);
    return httpHandler;
  };
  httpHandler.patch = (...args) => {
    rootRouter.patch(...args);
    return httpHandler;
  };
  httpHandler.put = (...args) => {
    rootRouter.put(...args);
    return httpHandler;
  };
  httpHandler.delete = (...args) => {
    rootRouter.delete(...args);
    return httpHandler;
  };
  httpHandler.options = (...args) => {
    rootRouter.options(...args);
    return httpHandler;
  };
  httpHandler.inject = inject;
  httpHandler.listen = (port, hostOrCb, maybeCb) => {
    const server = http.createServer(httpHandler);
    return server.listen(port, hostOrCb, maybeCb);
  };

  return httpHandler;
}
