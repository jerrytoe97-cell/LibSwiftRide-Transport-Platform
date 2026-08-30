import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { createScannerServer, downloadAndValidate, readConfiguration, scanWithClamd } from "./server.mjs";

const token = "synthetic-test-token-value";
const baseConfig = readConfiguration({ NODE_ENV: "test", KYC_SCANNER_TOKEN: token, KYC_SCANNER_MAX_BYTES: "1024" });
const pdf = Buffer.from("%PDF-1.4\nsynthetic-only\n%%EOF");
const checksum = createHash("sha256").update(pdf).digest("hex");

async function withServer(server, callback) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, "close"); }
}

test("health endpoints separate process liveness from ClamAV readiness", async () => {
  const server = createScannerServer(baseConfig, { ping: async () => "clean" });
  await withServer(server, async (url) => {
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    const ready = await fetch(`${url}/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: "ready", dependencies: { clamav: "ok" } });
  });
});

test("scan endpoint requires the bearer token", async () => {
  const server = createScannerServer(baseConfig, { download: async () => pdf, scan: async () => "clean" });
  await withServer(server, async (url) => {
    const response = await fetch(`${url}/v1/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
  });
});

test("returns the checksum-bound verdict for a valid synthetic document", async () => {
  const server = createScannerServer(baseConfig, { download: async () => pdf, scan: async () => "clean" });
  await withServer(server, async (url) => {
    const response = await fetch(`${url}/v1/scan`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ downloadUrl: "https://bucket.s3.example/signed", checksum, mimeType: "application/pdf", sizeBytes: pdf.length })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { verdict: "clean", checksum });
  });
});

test("preserves a safe EICAR infected verdict without persisting content", async () => {
  const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
  const eicarChecksum = createHash("sha256").update(eicar).digest("hex");
  const server = createScannerServer(baseConfig, { download: async () => eicar, scan: async () => "infected" });
  await withServer(server, async (url) => {
    const response = await fetch(`${url}/v1/scan`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ downloadUrl: "https://bucket.s3.example/signed", checksum: eicarChecksum, mimeType: "application/pdf", sizeBytes: eicar.length })
    });
    assert.deepEqual(await response.json(), { verdict: "infected", checksum: eicarChecksum });
  });
});

test("download validation fails closed for size, MIME, checksum, and redirect mismatches", async () => {
  const input = { downloadUrl: "https://bucket.s3.example/signed", checksum, mimeType: "application/pdf", sizeBytes: pdf.length };
  await assert.rejects(downloadAndValidate(input, baseConfig, async () => new Response(pdf, { headers: { "content-length": String(pdf.length + 1) } })));
  await assert.rejects(downloadAndValidate(input, baseConfig, async () => new Response(pdf, { headers: { "content-type": "image/png" } })));
  await assert.rejects(downloadAndValidate({ ...input, checksum: "a".repeat(64) }, baseConfig, async () => new Response(pdf)));
  await assert.rejects(downloadAndValidate(input, baseConfig, async () => { throw new TypeError("redirect blocked"); }));
});

test("ClamAV INSTREAM parsing recognizes clean, infected, malformed and timeout responses", async () => {
  async function verdict(reply, timeout = 500) {
    const fake = net.createServer((socket) => {
      let request = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        request = Buffer.concat([request, chunk]);
        if (request.length >= 4 && request.subarray(-4).equals(Buffer.alloc(4)) && reply !== null) socket.end(reply);
      });
    });
    return withServer(fake, async () => scanWithClamd(pdf, { ...baseConfig, clamdHost: "127.0.0.1", clamdPort: fake.address().port, clamdTimeoutMs: timeout }));
  }
  assert.equal(await verdict("stream: OK\n"), "clean");
  assert.equal(await verdict("stream: Eicar-Signature FOUND\n"), "infected");
  await assert.rejects(verdict("unexpected\n"));
  await assert.rejects(verdict(null, 20));
});

test("production configuration requires an explicit signed-download host allowlist", () => {
  assert.throws(() => readConfiguration({ NODE_ENV: "production", KYC_SCANNER_TOKEN: token }));
});
