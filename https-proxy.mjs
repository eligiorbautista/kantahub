// https-proxy.mjs
// A tiny HTTPS front door for KantaHub.
//
// Why this exists: browsers only expose the audio engine (AudioWorklet) in a
// "secure context". http://localhost counts as secure, but a plain
// http://192.168.1.2:3005 does not, so on a TV/laptop that reaches the app by
// LAN address the synth is blocked and songs never start. This terminates TLS
// (with a self-signed certificate it creates on first run) and streams requests
// to the app, which makes the origin secure and the audio engine available.
//
// Requests are piped, never buffered, so Server-Sent Events and HTTP Range
// (background video seeking) work exactly as they do on the plain port.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const TLS_DIR = process.env.TLS_DIR ?? "/tls";
const PORT = Number(process.env.HTTPS_PORT ?? 3443);
const TARGET_HOST = process.env.TARGET_HOST ?? "kantahub";
const TARGET_PORT = Number(process.env.TARGET_PORT ?? 3005);
// The address clients use. It is signed into the certificate and also used for
// the QR code the TV shows, so phones land on the same https:// origin.
const PUBLIC_HOST = process.env.KANTAHUB_TLS_HOST ?? "192.168.1.2";
const KEY_FILE = `${TLS_DIR}/key.pem`;
const CERT_FILE = `${TLS_DIR}/cert.pem`;

function ensureCertificate() {
  if (existsSync(KEY_FILE) && existsSync(CERT_FILE)) return;
  mkdirSync(TLS_DIR, { recursive: true });
  console.log(`[https] creating a self-signed certificate for ${PUBLIC_HOST} …`);
  execFileSync(
    "openssl",
    [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", KEY_FILE,
      "-out", CERT_FILE,
      "-days", "3650",
      "-subj", `/CN=${PUBLIC_HOST}`,
      "-addext", `subjectAltName=IP:${PUBLIC_HOST},IP:127.0.0.1,DNS:localhost`,
    ],
    { stdio: "inherit" },
  );
}

ensureCertificate();

const server = https.createServer(
  { key: readFileSync(KEY_FILE), cert: readFileSync(CERT_FILE) },
  (req, res) => {
    const upstream = http.request(
      {
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: req.method,
        path: req.url,
        headers: {
          ...req.headers,
          // Keep the client's own host so the app builds QR/links for this
          // https origin, and tell it the scheme it was reached with.
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host ?? `${PUBLIC_HOST}:${PORT}`,
        },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      console.error("[https] cannot reach the app:", err.message);
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("KantaHub is not reachable on the app port.");
    });
    // Stream the body straight through (uploads are tiny, responses can be large).
    req.pipe(upstream);
  },
);

// SSE streams stay open for minutes and media transfers can be slow: never cut
// a request off on a timer.
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.keepAliveTimeout = 65_000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[https] listening on https://${PUBLIC_HOST}:${PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
