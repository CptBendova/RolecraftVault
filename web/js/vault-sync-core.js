/* Pure, deterministic multi-device reconciliation. No storage or networking. */
(function (host) {
  "use strict";
  const TABLES = { character: ["chars:all", "id"], persona: ["personas:all", "id"], lore: ["lore:all", "id"], prompt: ["prompts:all", "id"], trash: ["trash:all", "tid"], bucket: ["buckets:meta", null], personaBucket: ["pbuckets:meta", null], loreBook: ["lore:meta", null], promptBook: ["prompts:meta", null] };
  TABLES.privacyBlur = ["blurset", "$value"];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const dict = () => Object.create(null);
  const validId = s => typeof s === "string" && s.length > 0 && s.length <= 512 && !/[\u0000-\u001f]/.test(s) && !["__proto__", "constructor", "prototype"].includes(s);
  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  function keyOf(kind, id) { if (!own(TABLES, kind) || !validId(id)) throw Error("A library record has an invalid sync identity"); return JSON.stringify([kind, id]); }
  function parts(key) { const p = JSON.parse(key); if (!Array.isArray(p) || p.length !== 2 || keyOf(p[0], p[1]) !== key) throw Error("Invalid sync record key"); return p; }
  function collect(raw) {
    const out = dict();
    for (const [kind, [storage, idField]] of Object.entries(TABLES)) {
      const data = raw[storage] == null ? (idField ? [] : {}) : JSON.parse(raw[storage]);
      if (idField ? !Array.isArray(data) : !data || typeof data !== "object" || Array.isArray(data)) throw Error("Cannot sync damaged " + storage);
      for (const [id, value] of idField ? data.map(v => idField === "$value" ? [v, {id:v}] : [v && v[idField], v]) : Object.entries(data)) {
        const key = keyOf(kind, id);
        if (!value || typeof value !== "object" || Array.isArray(value) || own(out, key)) throw Error("Duplicate or damaged library record in " + storage);
        out[key] = value;
      }
    }
    return out;
  }
  function expand(items, previous = {}) {
    const raw = dict();
    for (const [storage, idField] of Object.values(TABLES)) raw[storage] = idField ? [] : dict();
    for (const key of Object.keys(items).sort()) {
      const [kind, id] = parts(key), [storage, idField] = TABLES[kind], value = items[key];
      if (idField) raw[storage].push(idField === "$value" ? id : value); else raw[storage][id] = value;
    }
    for (const [storage,idField] of Object.values(TABLES)) if (idField && previous[storage]) {
      const old = JSON.parse(previous[storage]), positions = new Map(old.map((v,i) => [idField === "$value" ? v : v[idField],i]));
      raw[storage].sort((a,b) => (positions.get(idField === "$value" ? a : a[idField]) ?? Infinity) - (positions.get(idField === "$value" ? b : b[idField]) ?? Infinity));
    }
    return Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, JSON.stringify(v)]));
  }
  function clockMax(versions) {
    const out = dict();
    for (const version of versions) for (const [id, count] of Object.entries(version.clock)) out[id] = Math.max(out[id] || 0, count);
    return out;
  }
  function dominates(a, b) { return Object.keys(b).every(k => (a[k] || 0) >= b[k]) && Object.keys(a).some(k => a[k] > (b[k] || 0)); }
  function frontier(versions) {
    const combined = dict();
    for (const v of versions) {
      const previous = combined[v.hash];
      combined[v.hash] = previous ? { ...v, clock: clockMax([previous,v]), author: [previous.author,v.author].sort()[0], at: Math.max(previous.at, v.at) } : v;
    }
    const unique = Object.values(combined);
    return unique.filter(v => !unique.some(other => other !== v && dominates(other.clock, v.clock))).sort((a,b) => a.hash.localeCompare(b.hash));
  }
  async function validate(snapshot, hash) {
    if (!snapshot || snapshot.format !== 1 || !snapshot.entries || Array.isArray(snapshot.entries) || Object.keys(snapshot.entries).length > 100000) throw Error("Invalid or oversized sync index");
    for (const [key, entry] of Object.entries(snapshot.entries)) {
      parts(key);
      if (!entry || !Array.isArray(entry.versions) || !entry.versions.length || entry.versions.length > 32) throw Error("Invalid sync revisions");
      for (const v of entry.versions) {
        if (!v || !validId(v.author) || !v.clock || Array.isArray(v.clock) || Object.keys(v.clock).length > 64 || !Object.keys(v.clock).length || !Number.isSafeInteger(v.at) || v.at < 0) throw Error("Invalid sync clock");
        for (const [id,n] of Object.entries(v.clock)) if (!validId(id) || !Number.isSafeInteger(n) || n < 1) throw Error("Invalid sync clock");
        if (v.value !== null && (!v.value || typeof v.value !== "object" || Array.isArray(v.value))) throw Error("Invalid synced record");
        const [kind,id] = parts(key), idField = TABLES[kind][1];
        if (v.value && idField && v.value[idField === "$value" ? "id" : idField] !== id) throw Error("Synced record identity does not match its key");
        if (v.hash !== await hash(canonical(v.value))) throw Error("Synced record checksum failed");
      }
    }
    return snapshot;
  }
  async function scan(items, prior, device, hash) {
    const entries = dict(), old = prior && prior.entries || {};
    for (const key of new Set([...Object.keys(items), ...Object.keys(old)])) {
      parts(key);
      const value = own(items,key) ? items[key] : null, digest = await hash(canonical(value)), previous = old[key];
      if (previous && previous.applied === digest) { entries[key] = previous; continue; }
      const clock = clockMax(previous ? previous.versions : []);
      clock[device] = (clock[device] || 0) + 1;
      entries[key] = { applied: digest, versions: [{value, hash:digest, clock, author:device, at:Date.now()}] };
    }
    return {format:1, entries};
  }
  async function merge(snapshots, primary, hash) {
    const entries = dict(), items = dict(); let conflicts = 0;
    for (const snapshot of snapshots) {
      await validate(snapshot,hash);
      for (const [key,entry] of Object.entries(snapshot.entries)) entries[key] = {versions: frontier([...(entries[key] ? entries[key].versions : []), ...entry.versions])};
    }
    /* Synthetic conflict identities are deterministic on all peers. If a user
       edits or deletes a conflict copy later, its descendant beats this seed. */
    for (const key of Object.keys(entries).sort()) {
      const siblings = entries[key].versions;
      if (siblings.length < 2) continue;
      const ordered = [...siblings].sort((a,b) => Number(b.value !== null)-Number(a.value !== null) || Number(own(b.clock,primary))-Number(own(a.clock,primary)) || a.hash.localeCompare(b.hash));
      for (const loser of ordered.slice(1)) {
        if (loser.value === null) continue;
        const [kind,id] = parts(key), idField = TABLES[kind][1];
        const copyId = id.slice(0,440) + "-conflict-" + loser.hash.slice(0,24), copyKey = keyOf(kind,copyId);
        const value = JSON.parse(JSON.stringify(loser.value));
        if (idField) value[idField] = copyId;
        if (typeof value.name === "string") value.name += " (sync conflict)";
        else if (typeof value.title === "string") value.title += " (sync conflict)";
        const seed = {...loser,value,hash:await hash(canonical(value))};
        entries[copyKey] = {versions:frontier([...(entries[copyKey] ? entries[copyKey].versions : []), seed])};
        conflicts++;
      }
    }
    for (const [key,entry] of Object.entries(entries)) {
      const winner = [...entry.versions].sort((a,b) => Number(b.value !== null)-Number(a.value !== null) || Number(own(b.clock,primary))-Number(own(a.clock,primary)) || a.hash.localeCompare(b.hash))[0];
      entry.applied = winner.hash;
      if (winner.value !== null) items[key] = winner.value;
    }
    return {snapshot:{format:1,entries},items,conflicts};
  }
  function difference(before, after) {
    let added=0,changed=0,removed=0;
    for (const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      if (!own(before,key)) added++;
      else if (!own(after,key)) removed++;
      else if (canonical(before[key]) !== canonical(after[key])) changed++;
    }
    return {added,changed,removed};
  }
  const api={TABLES,canonical,collect,expand,keyOf,parts,frontier,scan,merge,validate,difference};
  if (typeof module !== "undefined" && module.exports) module.exports=api; else host.RolecraftSyncCore=api;
})(typeof window === "undefined" ? globalThis : window);
