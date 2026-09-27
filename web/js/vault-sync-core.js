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
  function originalConversationId(id) {
    let source = id, previous;
    do { previous = source; source = source.replace(/(?:-conflict-[a-f0-9]{24}|~conflict-[A-Za-z0-9-]{1,100})$/, ""); } while (source !== previous);
    return source;
  }
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
  function frontier(versions, kind, recovery = false) {
    // A recovery identity names one discarded revision, not an editable live
    // record. Once restored/purged, an offline peer must not seed it again.
    if (recovery && versions.some(v => v.value === null)) versions = versions.filter(v => v.value === null);
    const combined = dict();
    for (const v of versions) {
      // A save timestamp alone is not a competing character/persona edit.
      // Retain a real, checksummed revision and all causal history; never
      // strip writing, picture references or timestamps from stored records.
      let identity = v.hash;
      if ((kind === "character" || kind === "persona") && v.value) {
        const content = {...v.value}; delete content.updatedAt;
        identity = canonical(content);
      }
      if (recovery && v.value && v.value.syncConflict === true && v.value.syncRecovered === true) {
        const content = {...v.value}; delete content.deletedAt;
        identity = canonical(content);
      }
      const previous = combined[identity];
      const chosen = previous && (recovery && previous.value && v.value && previous.value.deletedAt !== v.value.deletedAt ? previous.value.deletedAt < v.value.deletedAt : previous.hash.localeCompare(v.hash) < 0) ? previous : v;
      combined[identity] = previous ? { ...chosen, clock: clockMax([previous,v]), author: [previous.author,v.author].sort()[0], at: Math.max(previous.at, v.at) } : v;
    }
    const unique = Object.values(combined);
    return unique.filter(v => !unique.some(other => other !== v && dominates(other.clock, v.clock))).sort((a,b) => a.hash.localeCompare(b.hash));
  }
  // A conversation is a message tree. Two devices can extend different leaves
  // before they meet again without editing any existing writing. Keep those
  // turns as selectable paths in one story instead of duplicating the whole
  // conversation. Any changed/deleted shared message or other story setting
  // still uses the conservative conflict-copy path below.
  async function joinConversationVersions(versions, key, hash) {
    if (versions.length < 2 || versions.some(v => !v.value || !v.value._sync?.rev || v.value._sync.deleted)) return null;
    const stable = value => { const copy = {...value}; for (const name of ["_sync", "messages", "leafId", "updatedAt"]) delete copy[name]; return canonical(copy); };
    const identity = stable(versions[0].value);
    if (versions.some(v => stable(v.value) !== identity)) return null;
    const maps = versions.map(v => {
      const rows = v.value.messages;
      if (!Array.isArray(rows) || rows.some(m => !m || typeof m.id !== "string" || m.pending)) return null;
      const byId = new Map(rows.map(m => [m.id,m]));
      return byId.size === rows.length ? byId : null;
    });
    if (maps.some(m => !m)) return null;
    const common = new Set([...maps[0].keys()].filter(id => maps.every(m => m.has(id))));
    if (!common.size) return null;
    const sameTree = versions.every(v => canonical(v.value.messages) === canonical(versions[0].value.messages) && v.value.leafId === versions[0].value.leafId);
    if (!sameTree) {
      // Every peer must prove it kept the same earlier message set. Otherwise
      // a union could bring back a message deliberately removed on one device.
      const proofs = ["baseMessages","originMessages"].filter(name =>
        versions[0][name] && versions[0][name].count >= 1 && versions.every(v => canonical(v[name]) === canonical(versions[0][name]))).map(name => versions[0][name]);
      const commonHash = await hash(canonical([...common].sort()));
      if (!proofs.length || !proofs.some(proof => proof.count === common.size && proof.hash === commonHash)) return null;
      if (versions.some((v,i) => !maps[i].has(v.value.leafId) || common.has(v.value.leafId))) return null;
    }
    const union = new Map();
    for (const byId of maps) for (const [id,message] of byId) {
      if (union.has(id) && canonical(union.get(id)) !== canonical(message)) return null;
      union.set(id,message);
    }
    if (!sameTree) for (const byId of maps) for (const id of byId.keys()) {
      if (common.has(id)) continue;
      const seen = new Set(); let at = id;
      while (!common.has(at)) {
        if (seen.has(at)) return null;
        seen.add(at);
        const message = byId.get(at);
        if (!message || !message.parentId) return null;
        at = message.parentId;
      }
    }
    const ordered = [...union.values()].sort((x,y) => (x.createdAt || 0) - (y.createdAt || 0) || x.id.localeCompare(y.id));
    const messages = [],placed = new Set(),visiting = new Set();
    function visit(message) {
      if (placed.has(message.id)) return true;
      if (visiting.has(message.id)) return false;
      visiting.add(message.id);
      if (message.parentId && (!union.has(message.parentId) || !visit(union.get(message.parentId)))) return false;
      visiting.delete(message.id);placed.add(message.id);messages.push(message);return true;
    }
    if (!ordered.every(visit)) return null;
    const clock = clockMax(versions);
    const latest = [...versions].sort((a,b) => (Number(b.value.updatedAt)||0)-(Number(a.value.updatedAt)||0) || String(b.value.leafId||"").localeCompare(String(a.value.leafId||"")))[0];
    const leafId = latest.value.leafId;
    const rev = "syncmerge-" + (await hash(key + "\n" + canonical({clock,messages,leafId}))).slice(0,32);
    const ancestors = [...new Set(versions.flatMap(v => [v.value._sync.rev,...(v.value._sync.ancestors || [])]))].sort();
    const value = {...latest.value,messages,leafId,updatedAt:Math.max(...versions.map(v => Number(v.value.updatedAt)||0)),_sync:{rev,ancestors,deleted:false}};
    return {value,hash:await hash(canonical(value)),clock,author:versions.map(v => v.author).sort()[0],at:Math.max(...versions.map(v => v.at))};
  }
  async function validate(snapshot, hash) {
    if (!snapshot || snapshot.format !== 1 || !snapshot.entries || Array.isArray(snapshot.entries) || Object.keys(snapshot.entries).length > 100000) throw Error("Invalid or oversized sync index");
    for (const [key, entry] of Object.entries(snapshot.entries)) {
      parts(key);
      if (!entry || !Array.isArray(entry.versions) || !entry.versions.length || entry.versions.length > 32) throw Error("Invalid sync revisions");
      for (const v of entry.versions) {
        if (!v || !validId(v.author) || !v.clock || Array.isArray(v.clock) || Object.keys(v.clock).length > 1024 || !Object.keys(v.clock).length || !Number.isSafeInteger(v.at) || v.at < 0) throw Error("Invalid sync clock");
        for (const [id,n] of Object.entries(v.clock)) if (!validId(id) || !Number.isSafeInteger(n) || n < 1) throw Error("Invalid sync clock");
        if (v.value !== null && (!v.value || typeof v.value !== "object" || Array.isArray(v.value))) throw Error("Invalid synced record");
        const [kind,id] = parts(key), idField = TABLES[kind][1];
        if (v.value && idField && v.value[idField === "$value" ? "id" : idField] !== id) throw Error("Synced record identity does not match its key");
        if (v.baseMessages != null && (kind !== "conversation" || !v.baseMessages || !Number.isSafeInteger(v.baseMessages.count) || v.baseMessages.count < 0 || v.baseMessages.count > 100000 || typeof v.baseMessages.hash !== "string" || !/^[a-f0-9]{64}$/.test(v.baseMessages.hash))) throw Error("Invalid conversation sync base");
        if (v.originMessages != null && (kind !== "conversation" || !v.originMessages || !Number.isSafeInteger(v.originMessages.count) || v.originMessages.count < 0 || v.originMessages.count > 100000 || typeof v.originMessages.hash !== "string" || !/^[a-f0-9]{64}$/.test(v.originMessages.hash))) throw Error("Invalid conversation sync base");
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
      const [kind] = parts(key), prior = kind === "conversation" && previous && previous.versions.find(v => v.hash === previous.applied), base = prior && prior.value;
      const baseMessages = base && Array.isArray(base.messages) && base.messages.every(m => m && typeof m.id === "string") ? {count:base.messages.length,hash:await hash(canonical(base.messages.map(m => m.id).sort()))} : null;
      // The last message set this device observed from elsewhere. It survives
      // only pure local appends, so several local saves (user turn, then reply)
      // still prove the same shared base as a peer that saved once.
      const ids = value && Array.isArray(value.messages) ? new Set(value.messages.map(m => m && m.id)) : null;
      const originMessages = baseMessages && ids && prior.author === device && prior.originMessages && base.messages.every(m => ids.has(m.id)) ? prior.originMessages : baseMessages;
      entries[key] = { applied: digest, versions: [{value, hash:digest, clock, author:device, at:Date.now(),...(baseMessages?{baseMessages,originMessages}:{})}] };
    }
    return {format:1, entries};
  }
  async function merge(snapshots, primary, hash, options = {}) {
    const entries = dict(), items = dict(); let conflicts = 0;
    const singleLibrary = options.singleLibrary === true, recoveryDependencies = dict();
    const activeKinds = new Set(["character", "persona", "lore", "prompt"]);
    const isRecovery = key => { const [kind,id] = parts(key); return singleLibrary && kind === "trash" && /^sync-(?:conflict|review)-[a-f0-9]{40}$/.test(id); };
    const reconcile = (versions,key) => frontier(versions,parts(key)[0],isRecovery(key));
    const order = (a,b) => Number(b.value !== null)-Number(a.value !== null) || Number(own(b.clock,primary))-Number(own(a.clock,primary)) || a.hash.localeCompare(b.hash);
    let localEntries = {};
    if (singleLibrary) {
      if (!validId(options.device) || !validId(primary)) throw Error("Invalid sync primary device");
      if (options.localSnapshot) {
        await validate(options.localSnapshot,hash);
        localEntries = options.localSnapshot.entries;
        for (const entry of Object.values(localEntries)) if (!entry.versions.some(v => v.hash === entry.applied)) throw Error("Local applied sync revision is missing");
      }
    }
    for (const snapshot of snapshots) {
      await validate(snapshot,hash);
      for (const [key,entry] of Object.entries(snapshot.entries)) entries[key] = {versions: reconcile([...(entries[key] ? entries[key].versions : []), ...entry.versions], key)};
    }
    if (singleLibrary) {
      const reviewedAliases = new Map();
      for (const [key,entry] of Object.entries(entries)) {
        const [kind,id] = parts(key);
        if (kind !== "character") continue;
        const ordered = [...entry.versions].sort(order), applied = options.device === primary && localEntries[key] && localEntries[key].applied;
        const winner = ordered.find(v => v.hash === applied && v.value !== null) || ordered[0];
        if (!winner.value || !Array.isArray(winner.value.syncAliases)) continue;
        for (const alias of new Set(winner.value.syncAliases)) {
          if (!validId(alias) || alias === id || !/-conflict-[a-f0-9]{24}$/.test(alias)) continue;
          const copyKey = keyOf(kind,alias), owners = reviewedAliases.get(copyKey) || new Set();
          owners.add(key); reviewedAliases.set(copyKey,owners);
        }
      }
      for (const [key,owners] of reviewedAliases) {
        const siblings = entries[key] && entries[key].versions;
        // Only an explicitly reviewed identity with an outstanding deletion
        // qualifies. A later deliberate restore dominates that tombstone and
        // remains a normal live record, never inferred from its display name.
        if (owners.size !== 1 || !siblings || !siblings.some(v => v.value === null) || !siblings.some(v => v.value !== null)) continue;
        const union = clockMax(siblings);
        for (const revision of siblings) {
          if (revision.value === null) continue;
          const tid = "sync-review-" + (await hash(key + "\n" + revision.hash)).slice(0,40), binKey = keyOf("trash",tid);
          if (!entries[binKey]) {
            const value = {tid,type:"character",record:JSON.parse(JSON.stringify(revision.value)),deletedAt:revision.at,syncRecovered:true,syncConflict:true};
            entries[binKey] = {versions:[{...revision,clock:{...union},value,hash:await hash(canonical(value))}]};
          }
          if (entries[binKey].versions.some(v => v.value !== null)) (recoveryDependencies[key] || (recoveryDependencies[key] = [])).push(binKey);
          conflicts++;
        }
        const clock = {...union}; clock[options.device] = (clock[options.device] || 0) + 1;
        if (!Number.isSafeInteger(clock[options.device])) throw Error("Sync revision counter exhausted");
        entries[key] = {versions:[{value:null,hash:await hash(canonical(null)),clock,author:options.device,at:Math.max(...siblings.map(v => v.at))}]};
      }
    }
    /* Synthetic conflict identities are deterministic on all peers. If a user
       edits or deletes a conflict copy later, its descendant beats this seed. */
    for (const key of Object.keys(entries).sort()) {
      const siblings = entries[key].versions;
      if (siblings.length < 2) continue;
      let ordered = [...siblings].sort(order);
      const [kind,id] = parts(key);
      if (kind === "conversation") {
        const joined = await joinConversationVersions(ordered,key,hash);
        if (joined) { entries[key] = {versions:[joined]}; continue; }
      }
      if (singleLibrary && activeKinds.has(kind)) {
        // Primary is a conflict preference, never a one-way mirror. A normal
        // descendant from any device already won in frontier() above.
        const applied = options.device === primary && localEntries[key] && localEntries[key].applied;
        const preferred = applied && ordered.find(v => v.hash === applied && v.value !== null);
        if (preferred) ordered = [preferred,...ordered.filter(v => v !== preferred)];
        const union = clockMax(siblings);
        for (const loser of ordered.slice(1)) {
          if (loser.value === null) continue;
          const tid = "sync-conflict-" + (await hash(key + "\n" + loser.hash)).slice(0,40), binKey = keyOf("trash",tid);
          // Freeze existing seeds: unrelated later parent clocks must not make
          // an already reviewed or purged alternate look newly created.
          if (!entries[binKey]) {
            const value = {tid,type:kind,record:JSON.parse(JSON.stringify(loser.value)),deletedAt:loser.at,syncRecovered:true,syncConflict:true};
            entries[binKey] = {versions:[{...loser,clock:{...union},value,hash:await hash(canonical(value))}]};
          }
          if (entries[binKey].versions.some(v => v.value !== null)) (recoveryDependencies[key] || (recoveryDependencies[key] = [])).push(binKey);
          conflicts++;
        }
        // Only the selected device may acknowledge all competing revisions.
        // Other peers keep that frontier, so the primary can still make the
        // authoritative choice when it next connects.
        if (options.device === primary) {
          const clock = {...union}; clock[primary] = (clock[primary] || 0) + 1;
          if (!Number.isSafeInteger(clock[primary])) throw Error("Sync revision counter exhausted");
          entries[key] = {versions:[{...ordered[0],clock,author:primary,at:Math.max(...siblings.map(v => v.at))}]};
        }
        continue;
      }
      for (const loser of ordered.slice(1)) {
        if (loser.value === null) continue;
        const idField = TABLES[kind][1];
        const sourceId = kind === "conversation" ? originalConversationId(validId(loser.value.conflictOf) ? loser.value.conflictOf : id) : id;
        const copyId = sourceId.slice(0,440) + "-conflict-" + loser.hash.slice(0,24), copyKey = keyOf(kind,copyId);
        const value = JSON.parse(JSON.stringify(loser.value));
        if (idField) value[idField] = copyId;
        if (kind === "conversation") value.conflictOf = sourceId;
        if (typeof value.name === "string") value.name = value.name.replace(/(?: \(sync conflict\))+$/, "") + " (sync conflict)";
        else if (typeof value.title === "string") value.title = value.title.replace(/(?: \(sync conflict\))+$/, "") + " (sync conflict)";
        const seed = {...loser,value,hash:await hash(canonical(value))};
        entries[copyKey] = {versions:frontier([...(entries[copyKey] ? entries[copyKey].versions : []), seed], kind)};
        conflicts++;
      }
    }
    for (const [key,entry] of Object.entries(entries)) {
      const winner = [...entry.versions].sort(order)[0];
      entry.applied = winner.hash;
      if (winner.value !== null) items[key] = winner.value;
    }
    // Dependencies also travel with an already resolved peer snapshot: its
    // source can have a one-revision frontier here even though this receiver
    // has not committed the recovery record (and its pictures) yet.
    if (singleLibrary) for (const [key,value] of Object.entries(items)) {
      if (!isRecovery(key) || value.syncConflict !== true || value.syncRecovered !== true || !activeKinds.has(value.type) || !value.record || !validId(value.record.id)) continue;
      const sourceKey = keyOf(value.type,value.record.id);
      if (entries[sourceKey]) recoveryDependencies[sourceKey] = [...new Set([...(recoveryDependencies[sourceKey] || []),key])].sort();
    }
    return {snapshot:{format:1,entries},items,conflicts,...(singleLibrary ? {recoveryDependencies} : {})};
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
