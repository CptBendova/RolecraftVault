// Focused checks for durable Chat saves and event-driven private LAN sync.
// Execute the shipped renderer functions; no real profile or network is used.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = name => fs.readFileSync(path.join(__dirname, "..", "app", name), "utf8");
const chatSource = source("chat.js");
const syncSource = source("vault-sync.js");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, description, timeout = 500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (test()) return;
    await delay(5);
  }
  throw Error("Timed out waiting for " + description);
}

async function checkDurableSaveWake() {
  const begin = chatSource.indexOf("function persist(next, imported) {");
  const end = chatSource.indexOf("function save(next)", begin);
  assert(begin >= 0 && end > begin, "Find the shipped Chat persist function");
  const events = [];
  let finishWrite;
  const context = vm.createContext({
    Sync: null,
    plannedRef: {current: []},
    uid: () => "test-revision",
    epoch: {current: 1},
    setSaved() {},
    setLinkStatus() {},
    linkRef: {current: null},
    saveQueue: {current: Promise.resolve()},
    savedRawRef: {current: null},
    pendingSaves: {current: 0},
    saveFailed: {current: false},
    setError() {},
    CHAT_KEY: "chats:all",
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    window: {
      CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
      storage: {syncCommit(values, expected) {
        assert.equal(values["chats:all"], '[{"id":"one"}]');
        assert.equal(expected["chats:all"], null);
        return new Promise(resolve => { finishWrite = resolve; });
      }},
      dispatchEvent(event) { events.push(event.type); }
    }
  });
  vm.runInContext(chatSource.slice(begin, end), context);
  const saving = context.persist([{id: "one"}]);
  await until(() => !!finishWrite, "encrypted Chat write to begin");
  assert.deepEqual(events, [], "A Chat change must not be advertised before its durable write");
  finishWrite();
  await saving;
  await delay(0);
  assert.deepEqual(events, ["rcv-chat-saved"], "One completed Chat write wakes local sync once");
  assert.equal(context.pendingSaves.current, 0, "The save gate settles after persistence");
  context.window.storage.syncCommit = async () => { throw Error("Encrypted storage unavailable"); };
  await assert.rejects(context.persist([{id: "two"}]), /Encrypted storage unavailable/);
  await delay(0);
  assert.deepEqual(events, ["rcv-chat-saved"], "A failed write must never advertise unsaved Chat data");
  console.log("PASS durable Chat save wakes sync only after storage succeeds");
}

function checkWakeWiring() {
  const app = source("app.js");
  assert(/addEventListener\(["']rcv-chat-saved["']\s*,\s*chatSaved\)/.test(app), "The mounted app listens for durable Chat saves");
  assert(/chatSaved\s*=\s*\(\)\s*=>\s*engine\.localStorySaved\s*\?\s*engine\.localStorySaved\(\)/.test(app), "A saved Chat change wakes local publication even in manual mode");
  assert(/removeEventListener\(["']rcv-chat-saved["']\s*,\s*chatSaved\)/.test(app), "Unmount removes the Chat-save listener");
  console.log("PASS Chat save event is wired to the mounted sync engine");
}

function checkOpenModalDoesNotBlockIncoming() {
  const assignment = chatSource.split(/\r?\n/).find(line => line.includes("window.RolecraftChatSyncIdle = function"));
  assert(assignment, "Find the shipped Chat apply gate");
  const context = vm.createContext({
    window: {},
    ready: true,
    busyRef: {current: false},
    saveFailed: {current: false},
    linkBusy: {current: false},
    pendingSaves: {current: 0},
    edit: null,
    document: {querySelector: () => ({className: "rcchat-modalback"})}
  });
  vm.runInContext(assignment, context);
  assert.equal(context.window.RolecraftChatSyncIdle(), true, "An open modal alone must not stall incoming Chat changes");
  context.pendingSaves.current = 1;
  assert.equal(context.window.RolecraftChatSyncIdle(), false, "An unsaved local edit still blocks incoming changes");
  context.pendingSaves.current = 0;
  context.edit = {id: "editing"};
  assert.equal(context.window.RolecraftChatSyncIdle(), false, "An active message edit still blocks incoming changes");
  console.log("PASS an open modal is not confused with active editing");
}

function makeEngine(intervalMs, bridge) {
  let statusCalls = 0;
  let serveCalls = 0;
  let manualPreference = "0";
  let holdNext = false;
  let finishStatus;
  let nativeWake;
  let nativeWakeRemoved = 0;
  async function nativeCall(method) {
    if (method === "status") {
      statusCalls++;
      if (holdNext) {
        holdNext = false;
        await new Promise(resolve => { finishStatus = resolve; });
      }
      return {enabled: true, group: "test-group", device: "test-device"};
    }
    if (method === "serve") { serveCalls++; return {enabled: true, group: "test-group", device: "test-device"}; }
    if (method === "pause") return {};
    throw Error("Unexpected native call " + method);
  }
  const host = {
    RolecraftSyncCore: {extension: {id: "stories1"}},
    vaultSync: {call: nativeCall}
  };
  if (bridge === "windows") host.vaultSync.onWake = callback => {
    nativeWake = callback;
    return () => { nativeWake = null; nativeWakeRemoved++; };
  };
  if (bridge === "android" || bridge === "androidCallback") {
    delete host.vaultSync;
    host.Capacitor = {
      nativePromise: (plugin, action, request) => {
        assert.equal(plugin, "VaultSync");
        if (action === "removeListener") { assert.equal(request.eventName, "vaultSyncWake"); nativeWake = null; nativeWakeRemoved++; return Promise.resolve({}); }
        assert.equal(action, "dispatch");
        return nativeCall(request.method);
      }
    };
    if (bridge === "android") host.Capacitor.addListener = async (plugin, event, callback) => {
        assert.equal(plugin, "VaultSync"); assert.equal(event, "vaultSyncWake");
        nativeWake = callback;
        return {remove() { nativeWake = null; nativeWakeRemoved++; }};
      };
    else host.Capacitor.nativeCallback = (plugin, action, request, callback) => {
      assert.equal(plugin, "VaultSync"); assert.equal(action, "addListener"); assert.equal(request.eventName, "vaultSyncWake");
      nativeWake = callback; return "fixture-callback";
    };
  }
  const context = vm.createContext({window: host, document: {hidden: false}, crypto: crypto.webcrypto, TextEncoder, setTimeout, clearTimeout, console});
  vm.runInContext(syncSource, context);
  const storage = {
    get: async key => ({value: key === "sync:state" ? JSON.stringify({group: "test-group", approved: false}) : key === "ui:sync-manual-refresh" ? manualPreference : "[]"}),
    set: async (key, value) => { assert.equal(key, "ui:sync-manual-refresh"); manualPreference = value; },
    syncCommit: async () => { throw Error("First-sync consent must never be bypassed"); }
  };
  const engine = host.RolecraftVaultSync.create({storage, intervalMs, ready: () => true, canApply: () => true, canApplyStories: () => true, imageIds: () => [], onApplied: () => {}});
  return {engine, get statusCalls() { return statusCalls; }, get serveCalls() { return serveCalls; }, hold() { holdNext = true; }, get held() { return !!finishStatus; }, release() { const release = finishStatus; finishStatus = null; release(); },
    get nativeSubscribed() { return !!nativeWake; }, get nativeWakeRemoved() { return nativeWakeRemoved; }, fireNativeWake() { assert(nativeWake, "Native wake must be subscribed"); nativeWake(); }};
}

async function enterChatLane(fixture) {
  fixture.engine.start();
  await until(() => fixture.statusCalls >= 1, "initial sync check");
  fixture.engine.setWorkspacePaused(true);
  await until(() => fixture.statusCalls >= 2, "Chat-only lane check");
  await delay(20);
}

async function checkImmediateAndBusyWake() {
  const fixture = makeEngine(1200);
  try {
    await enterChatLane(fixture);
    assert.equal(typeof fixture.engine.wakeStories, "function", "Private Chat exposes an immediate sync wake");
    const before = fixture.statusCalls;
    fixture.engine.wakeStories();
    await until(() => fixture.statusCalls > before, "immediate Chat wake", 350);
    await delay(20);
    fixture.hold();
    const prior = fixture.statusCalls;
    fixture.engine.wakeStories();
    await until(() => fixture.statusCalls > prior && fixture.held, "busy Chat check", 350);
    fixture.engine.wakeStories();
    fixture.engine.wakeStories();
    fixture.release();
    await until(() => fixture.statusCalls >= prior + 2, "coalesced wake after busy pass", 350);
    await delay(30);
    assert.equal(fixture.statusCalls, prior + 2, "Several busy-time wakes coalesce into one follow-up check");
    console.log("PASS Chat save and peer notifications wake immediately, including during a busy pass");
  } finally { fixture.engine.stop(); }
}

async function checkFallbackPolling() {
  const fixture = makeEngine(140);
  try {
    await enterChatLane(fixture);
    const before = fixture.statusCalls;
    await until(() => fixture.statusCalls > before, "periodic fallback while no event arrives", 450);
    console.log("PASS periodic sync remains as fallback when wake packets are missed");
  } finally { fixture.engine.stop(); }
}

async function checkManualRefresh() {
  const fixture = makeEngine(140);
  try {
    await enterChatLane(fixture);
    await fixture.engine.setManualRefresh(true);
    await until(() => fixture.serveCalls >= 1, "manual mode to keep the peer server available");
    const quiet = fixture.statusCalls;
    fixture.engine.wakeStories();
    await delay(220);
    assert.equal(fixture.statusCalls, quiet, "Manual mode suppresses periodic checks and Chat wakes");
    fixture.engine.localStorySaved();
    await until(() => fixture.statusCalls > quiet, "durable local Chat save to prepare serving", 350);
    const afterSave = fixture.statusCalls;
    fixture.engine.retry();
    await until(() => fixture.statusCalls > afterSave, "explicit manual refresh", 350);
    const refreshed = fixture.statusCalls;
    await delay(220);
    assert.equal(fixture.statusCalls, refreshed, "Manual refresh is one pass, not a resumed polling loop");
    console.log("PASS manual mode serves saved chats without peer polling until Refresh now is chosen");
  } finally { fixture.engine.stop(); }
}

async function checkNativeWakeSubscription(bridge) {
  const fixture = makeEngine(1200, bridge);
  try {
    await enterChatLane(fixture);
    await until(() => fixture.nativeSubscribed, bridge + " native wake subscription");
    const before = fixture.statusCalls;
    fixture.fireNativeWake();
    await until(() => fixture.statusCalls > before, bridge + " native wake to trigger sync", 350);
    console.log("PASS " + bridge + " authenticated native wake reaches the Chat sync engine");
  } finally {
    fixture.engine.stop();
    assert.equal(fixture.nativeWakeRemoved, 1, bridge + " native event subscription is removed on stop");
  }
}

(async () => {
  await checkDurableSaveWake();
  checkWakeWiring();
  checkOpenModalDoesNotBlockIncoming();
  await checkImmediateAndBusyWake();
  await checkNativeWakeSubscription("windows");
  await checkNativeWakeSubscription("android");
  await checkNativeWakeSubscription("androidCallback");
  await checkFallbackPolling();
  await checkManualRefresh();
})().catch(error => { console.error(error); process.exitCode = 1; });
