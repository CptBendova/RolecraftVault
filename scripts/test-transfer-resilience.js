/* Exercise the real delta-polling helper from both shipped receivers. This
   catches the hang where /delta-start succeeds and the sender then disappears.
   It also checks the desktop's real option merge, where a reversed
   Object.assign silently shortened 10-minute downloads to three minutes. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DESKTOP = fs.readFileSync(path.join(ROOT, "app", "main.js"), "utf8");
const MOBILE = fs.readFileSync(path.join(ROOT, "mobile", "src", "rc-transfer.js"), "utf8");

function lift(src, name) {
  let start = src.indexOf("async function " + name);
  if (start < 0) start = src.indexOf("function " + name);
  if (start < 0) throw new Error("could not find " + name);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("could not find end of " + name);
}

function compile(src, name) {
  return new Function(lift(src, name) + "\nreturn " + name + ";")();
}

let failures = 0;
function check(label, condition, detail) {
  console.log((condition ? "  PASS  " : "  FAIL  ") + label + (detail ? "  " + detail : ""));
  if (!condition) failures++;
}

async function exercisePoll(label, src) {
  const poll = compile(src, "waitForDeltaReady");
  let reads = 0, sleeps = 0, applied = 0;
  const replies = [null, null, { phase: "packing" }, null, { phase: "ready", sizes: [12, 34] }];
  const ready = await poll(
    async () => replies[reads++],
    () => { applied++; },
    async ms => { if (ms === 400) sleeps++; }
  );
  check(label + " recovers from brief missing replies", ready.phase === "ready" && reads === 5 && applied === 2,
    "reads=" + reads + " applied=" + applied);

  reads = 0;
  sleeps = 0;
  let message = "";
  try {
    await poll(async () => { reads++; return null; }, () => {}, async () => { sleeps++; });
  } catch (e) { message = e.message; }
  check(label + " stops after five consecutive failures",
    reads === 5 && sleeps === 4 && /Lost contact/.test(message),
    "reads=" + reads + " sleeps=" + sleeps + " message=" + message);
}

(async () => {
  const options = compile(DESKTOP, "transferOptions");
  const merged = options({ host: "phone", port: 1234, timeout: 180000 }, { path: "/delta-file", timeout: 600000 });
  check("a request's explicit timeout beats the target default",
    merged.timeout === 600000 && merged.host === "phone" && merged.path === "/delta-file",
    "timeout=" + merged.timeout);

  const receive = DESKTOP.slice(DESKTOP.indexOf("async function receiveTransfer"), DESKTOP.indexOf("const passwordSet"));
  check("the modern desktop download asks for ten minutes",
    /transferOptions\(base, \{ path: "\/delta-file", method: "GET", timeout: 600000 \}\)/.test(receive));
  check("the legacy desktop download asks for ten minutes",
    /transferOptions\(base, \{[\s\S]*?path: "\/delta",[\s\S]*?timeout: 600000[\s\S]*?\}\), body, encPath/.test(receive));

  await exercisePoll("desktop", DESKTOP);
  await exercisePoll("Android", MOBILE);

  console.log(failures === 0 ? "\nAll checks passed." : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
