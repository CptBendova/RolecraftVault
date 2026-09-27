/* Explicit review of legacy visible conflict copies. Pure: no storage or I/O. */
(function (host) {
  "use strict";
  const KINDS = new Set(["character", "persona", "lore", "prompt"]);
  const SUFFIX = /-conflict-[a-f0-9]{24}$/;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const validId = value => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f]/.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function identity(key, record) {
    try {
      const p = JSON.parse(key);
      return Array.isArray(p) && p.length === 2 && KINDS.has(p[0]) && validId(p[1]) && JSON.stringify(p) === key && record && !Array.isArray(record) && typeof record === "object" && record.id === p[1] ? p : null;
    } catch (_) { return null; }
  }
  function groups(items) {
    const found = new Map();
    for (const key of Object.keys(items || {}).sort()) {
      const p = identity(key, items[key]);
      if (!p || !SUFFIX.test(p[1])) continue;
      let original = p[1];
      while (SUFFIX.test(original)) original = original.replace(SUFFIX, "");
      const originalKey = JSON.stringify([p[0], original]);
      // Long legacy IDs may have been truncated. Never guess which original
      // owns a copy, and never group unrelated records merely by their names.
      if (!own(items, originalKey) || !identity(originalKey, items[originalKey])) continue;
      const record = items[originalKey], name = typeof record.name === "string" ? record.name : typeof record.title === "string" ? record.title : original;
      if (!found.has(originalKey)) found.set(originalKey, {key: originalKey, kind: p[0], id: original, name, candidates: [{key: originalKey, id: original, record, original: true}]});
      found.get(originalKey).candidates.push({key, id: p[1], record: items[key], original: false});
    }
    return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  function clockMax(versions) {
    const out = Object.create(null);
    for (const version of versions) for (const [device, count] of Object.entries(version.clock)) out[device] = Math.max(out[device] || 0, count);
    return out;
  }
  function cleanCopyName(value, copyId, originalId) {
    const field = typeof value.name === "string" ? "name" : typeof value.title === "string" ? "title" : null;
    while (field && copyId !== originalId && SUFFIX.test(copyId)) {
      value[field] = value[field].replace(/ \(sync conflict\)$/, "");
      copyId = copyId.replace(SUFFIX, "");
    }
    return value;
  }
  async function resolve({items, snapshot, choices, device, hash, core}) {
    if (!choices || typeof choices !== "object" || Array.isArray(choices)) throw Error("Choose which conflict versions to keep");
    const selectedKeys = Object.keys(choices);
    if (!selectedKeys.length) return {items, snapshot, count: 0};
    if (!validId(device) || typeof hash !== "function" || !core) throw Error("Conflict review is unavailable");
    const available = new Map(groups(items).map(group => [group.key, group]));
    const selected = selectedKeys.sort().map(key => {
      const group = available.get(key), candidate = group && group.candidates.find(row => row.key === choices[key]);
      if (!candidate) throw Error("A conflict choice is no longer available; review the current copies again");
      return {group, candidate};
    });
    if (snapshot) await core.validate(snapshot, hash);
    const current = await core.scan(items, snapshot, device, hash), next = {...items};
    const resolved = [], archives = new Map(), now = Date.now();
    for (const {group, candidate} of selected) {
      for (const row of group.candidates) if (!current.entries[row.key].versions.some(revision => revision.hash === current.entries[row.key].applied && core.canonical(revision.value) === core.canonical(row.record))) throw Error("A reviewed sync revision is missing; sync again before reviewing copies");
      const value = clone(candidate.record);
      value.id = group.id;
      if (!candidate.original) cleanCopyName(value, candidate.id, group.id);
      const selectedContent = core.canonical(value);
      if (group.kind === "character") {
        const aliases = new Set();
        for (const row of group.candidates) {
          if (!row.original) aliases.add(row.id);
          if (Array.isArray(row.record.syncAliases)) for (const alias of row.record.syncAliases) if (validId(alias) && alias !== group.id) aliases.add(alias);
        }
        value.syncAliases = [...aliases].sort();
      }
      const revisions = group.candidates.flatMap(row => current.entries[row.key].versions), clock = clockMax(revisions);
      clock[device] = (clock[device] || 0) + 1;
      if (!Number.isSafeInteger(clock[device])) throw Error("Sync revision counter exhausted");
      // Archive original bytes, including every picture and variant reference.
      // Copies are retained even when selected, because their old identity can
      // still be useful when restoring a previous library or conversation.
      for (const row of group.candidates) {
        const versions = current.entries[row.key].versions;
        for (const revision of versions) {
          if (revision.value === null) continue;
          if (row.original && core.canonical(revision.value) === selectedContent) continue;
          const tid = "sync-review-" + (await hash(row.key + "\n" + revision.hash)).slice(0, 40), key = core.keyOf("trash", tid);
          // Do not recreate an exact reviewed revision deliberately purged
          // earlier. Existing live archives retain their original date/content.
          if (own(current.entries, key)) {
            const existing = current.entries[key].versions;
            if (!existing.some(v => v.value === null) && !existing.some(v => v.value && v.value.syncRecovered === true && v.value.syncConflict === true && v.value.type === group.kind && core.canonical(v.value.record) === core.canonical(revision.value))) throw Error("A recovery-bin identity is already in use");
            continue;
          }
          if (own(next, key)) throw Error("A recovery-bin identity is already in use");
          next[key] = {tid, type: group.kind, record: clone(revision.value), deletedAt: now, syncRecovered: true, syncConflict: true};
          archives.set(key, clock);
        }
        if (!row.original) delete next[row.key];
      }
      next[group.key] = value;
      resolved.push({group, clock});
    }
    const result = await core.scan(next, current, device, hash);
    for (const {group, clock} of resolved) for (const row of group.candidates) {
      const value = own(next, row.key) ? next[row.key] : null, digest = await hash(core.canonical(value));
      // The canonical winner and copy tombstones observe the entire reviewed
      // family. An old peer cannot re-create a copy or its earlier winner.
      result.entries[row.key] = {applied: digest, versions: [{value, hash: digest, clock: {...clock}, author: device, at: now}]};
    }
    for (const [key, clock] of archives) {
      const entry = result.entries[key], revision = entry.versions[0];
      entry.versions = [{...revision, clock: clockMax([revision, {clock}])}];
    }
    await core.validate(result, hash);
    return {items: next, snapshot: result, count: selected.length};
  }
  const api = {groups, resolve};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else host.RolecraftSyncReview = api;
})(typeof window === "undefined" ? globalThis : window);
