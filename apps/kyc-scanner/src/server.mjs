import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";

const JSON_LIMIT_BYTES = 4 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function integerEnvironment(environment, name, fallback, minimum, maximum) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
  return value;
}

export function readConfiguration(environment = process.env) {
  const token = environment.KYC_SCANNER_TOKEN ?? "";
  if (token.length < 16) throw new Error("KYC_SCANNER_TOKEN must contain at least 16 characters");
  const allowedDownloadHosts = new Set((environment.KYC_SCANNER_ALLOWED_DOWNLOAD_HOSTS ?? "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (environment.NODE_ENV === "production" && allowedDownloadHosts.size === 0) {
    throw new Error("KYC_SCANNER_ALLOWED_DOWNLOAD_HOSTS is required in production");
  }
  return {
    token,
    allowedDownloadHosts,
    production: environment.NODE_ENV === "production",
    port: integerEnvironment(environment, "PORT", 10_000, 1, 65_535),
    maxBytes: integerEnvironment(environment, "KYC_SCANNER_MAX_BYTES", 5 * 1024 * 1024, 1_024, 10 * 1024 * 1024),
    downloadTimeoutMs: integerEnvironment(environment, "KYC_SCANNER_DOWNLOAD_TIMEOUT_MS", 8_000, 1_000, 30_000),
    clamdHost: environment.CLAMD_HOST ?? "127.0.0.1",
    clamdPort: integerEnvironment(environment, "CLAMD_PORT", 3_310, 1, 65_535),
    clamdTimeoutMs: integerEnvironment(environment, "CLAMD_TIMEOUT_MS", 8_000, 1_000, 30_000)
  };
}

function authenticated(header, expectedToken) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > JSON_LIMIT_BYTES) throw Object.assign(new Error("request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("malformed JSON"), { status: 400 });
  }
}

function validateScanRequest(value, config) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error("invalid request"), { status: 400 });
  const { downloadUrl, checksum, mimeType, sizeBytes } = value;
  if (typeof downloadUrl !== "string" || typeof checksum !== "string" || !/^[a-f0-9]{64}$/i.test(checksum)
      || typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)
      || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > config.maxBytes) {
    throw Object.assign(new Error("invalid request"), { status: 400 });
  }
  let url;
  try { url = new URL(downloadUrl); } catch { throw Object.assign(new Error("invalid URL"), { status: 400 }); }
  if ((config.production && url.protocol !== "https:") || (!config.production && !["http:", "https:"].includes(url.protocol))) {
    throw Object.assign(new Error("invalid URL protocol"), { status: 400 });
  }
  if (config.allowedDownloadHosts.size > 0 && !config.allowedDownloadHosts.has(url.hostname.toLowerCase())) {
    throw Object.assign(new Error("download host is not allowed"), { status: 400 });
  }
  return { downloadUrl: url.toString(), checksum: checksum.toLowerCase(), mimeType, sizeBytes };
}

function validateMagicBytes(bytes, mimeType) {
  const valid = mimeType === "image/jpeg"
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === "image/png"
      ? bytes.length >= 8 && Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).equals(bytes.subarray(0, 8))
      : bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!valid) throw Object.assign(new Error("file signature mismatch"), { status: 422 });
}

export async function downloadAndValidate(input, config, fetchImplementation = fetch) {
  let response;
  try {
    response = await fetchImplementation(input.downloadUrl, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(config.downloadTimeoutMs),
      headers: { accept: input.mimeType }
    });
  } catch {
    throw Object.assign(new Error("download failed"), { status: 503 });
  }
  if (!response.ok) throw Object.assign(new Error("download failed"), { status: 503 });
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) !== input.sizeBytes) throw Object.assign(new Error("file size mismatch"), { status: 422 });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== input.mimeType) throw Object.assign(new Error("MIME type mismatch"), { status: 422 });
  const reader = response.body?.getReader();
  if (!reader) throw Object.assign(new Error("empty download"), { status: 422 });
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > input.sizeBytes || length > config.maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error("file size mismatch"), { status: 422 });
    }
    chunks.push(Buffer.from(value));
  }
  if (length !== input.sizeBytes) throw Object.assign(new Error("file size mismatch"), { status: 422 });
  const bytes = Buffer.concat(chunks);
  validateMagicBytes(bytes, input.mimeType);
  if (createHash("sha256").update(bytes).digest("hex") !== input.checksum) {
    throw Object.assign(new Error("checksum mismatch"), { status: 422 });
  }
  return bytes;
}

export function scanWithClamd(bytes, config) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: config.clamdHost, port: config.clamdPort });
    let reply = "";
    let settled = false;
    const finish = (error, verdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(verdict);
    };
    socket.setTimeout(config.clamdTimeoutMs, () => finish(Object.assign(new Error("scanner timeout"), { status: 503 })));
    socket.on("error", () => finish(Object.assign(new Error("scanner unavailable"), { status: 503 })));
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
      if (reply.includes("\0") || reply.includes("\n")) {
        const completeReply = reply.replaceAll("\0", "").trim();
        if (/\bOK\s*$/.test(completeReply)) finish(null, "clean");
        else if (/\bFOUND\s*$/.test(completeReply)) finish(null, "infected");
        else finish(Object.assign(new Error("invalid scanner response"), { status: 503 }));
      }
    });
    socket.on("end", () => {
      if (!settled) finish(Object.assign(new Error("invalid scanner response"), { status: 503 }));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(offset, Math.min(offset + 64 * 1024, bytes.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

function sendJson(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { "content-type": "application/json", "content-length": bytes.length, "cache-control": "no-store" });
  response.end(bytes);
}

export function createScannerServer(config, dependencies = {}) {
  const download = dependencies.download ?? ((input) => downloadAndValidate(input, config));
  const scan = dependencies.scan ?? ((bytes) => scanWithClamd(bytes, config));
  const ping = dependencies.ping ?? (() => scanWithClamd(Buffer.from("health-check"), config));
  return http.createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    if (request.method === "GET" && request.url === "/health/live") return sendJson(response, 200, { status: "ok" });
    if (request.method === "GET" && request.url === "/health/ready") {
      try {
        const verdict = await ping();
        return verdict === "clean" ? sendJson(response, 200, { status: "ready", dependencies: { clamav: "ok" } }) : sendJson(response, 503, { status: "not_ready" });
      } catch { return sendJson(response, 503, { status: "not_ready" }); }
    }
    if (request.method !== "POST" || request.url !== "/v1/scan") return sendJson(response, 404, { error: "not_found" });
    if (!authenticated(request.headers.authorization, config.token)) return sendJson(response, 401, { error: "unauthorized" });
    if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return sendJson(response, 415, { error: "unsupported_media_type" });
    try {
      const input = validateScanRequest(await readBody(request), config);
      const bytes = await download(input);
      const verdict = await scan(bytes);
      if (verdict !== "clean" && verdict !== "infected") throw Object.assign(new Error("invalid scanner result"), { status: 503 });
      return sendJson(response, 200, { verdict, checksum: input.checksum });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 503;
      return sendJson(response, status, { error: status >= 500 ? "scanner_unavailable" : "scan_rejected" });
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.replaceAll("\\", "/") === new URL(import.meta.url).pathname) {
  const config = readConfiguration();
  createScannerServer(config).listen(config.port, "0.0.0.0");
}
