#!/usr/bin/env node
/* Pre-ship checks:
   1. every JS file parses
   2. the interface (and web bundle) make no network calls
   Networking is allowed ONLY in app/main.js, for the opt-in Wi-Fi transfer. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const p = (...a) => path.join(root, ...a);

const parseTargets = [
  "app/main.js",
  "app/preload.js",
  "app/app.js",
  "installer/main.js",
  "installer/preload.js",
  "web/js/rolecraft-app.web.js",
  "web/js/rolecraft-web-platform.js",
];

const offlineTargets = [
  "app/app.js",
  "web/js/rolecraft-app.web.js",
  "web/js/rolecraft-web-platform.js",
];

/* EventSource and RTCPeerConnection are here because they are the two ways left
   to reach the network without touching fetch or XHR, and a data channel would
   not have shown up in any of the earlier sweeps. */
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|RTCPeerConnection|navigator\.serviceWorker|https?:\/\/(?!schemas\.|www\.w3\.org)/g;

let failed = 0;

for (const rel of parseTargets) {
  const file = p(rel);
  if (!fs.existsSync(file)) { console.log("skip (missing): " + rel); continue; }
  try {
    new Function(fs.readFileSync(file, "utf8"));
    console.log("parses      ✓  " + rel);
  } catch (e) {
    console.log("PARSE ERROR ✗  " + rel + " — " + e.message);
    failed++;
  }
}

for (const rel of offlineTargets) {
  const file = p(rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const hits = text.match(NETWORK);
  if (hits && hits.length) {
    console.log("NETWORK CALL ✗  " + rel + " — found: " + [...new Set(hits)].join(", "));
    failed++;
  } else {
    console.log("offline     ✓  " + rel);
  }
}

// main.js may use http, but flag anything pointing off the local network
const mainText = fs.readFileSync(p("app/main.js"), "utf8");
const external = (mainText.match(/https?:\/\/[a-z0-9.-]+/gi) || [])
  .filter(u => !/localhost|127\.0\.0\.1|schemas\.|w3\.org/i.test(u));
if (external.length) {
  console.log("OUTBOUND URL ✗  app/main.js — " + [...new Set(external)].join(", "));
  failed++;
} else {
  console.log("no outbound ✓  app/main.js (LAN transfer only)");
}

if (failed) {
  console.log("\n" + failed + " problem(s) found.");
  process.exit(1);
}
console.log("\nAll checks passed.");
