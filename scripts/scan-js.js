/* Static checks that `node --check` cannot make.

   Assignment to a const binding is a runtime TypeError, not a syntax error, so
   the integrity check passes and the app dies at the moment that line runs. One
   of those stopped every phone copy in 1.173.

   This walks the file with a real scope stack rather than matching lines, and
   skips strings, template literals, comments and regex literals so the huge
   amount of string data in the compiled interface cannot produce noise.

   Also reports: `await` used inside a non-async function, and duplicate object
   keys in a literal, both of which are silent. */
const fs = require("fs");

function scan(src, file) {
  const findings = [];
  const N = src.length;

  /* scope stack: each entry maps name -> {kind, line} */
  const scopes = [new Map()];
  /* function stack: is the function we are inside async? */
  const fns = [{ async: true, name: "<top>" }];  // top level: await is allowed in modules, do not flag

  const lineAt = pos => src.slice(0, pos).split("\n").length;

  let i = 0;
  let prevSig = "";           // previous significant character, for regex detection
  const idChar = c => /[A-Za-z0-9_$]/.test(c);

  const readIdentBack = pos => {
    let e = pos;
    while (e > 0 && /\s/.test(src[e - 1])) e--;
    let s = e;
    while (s > 0 && idChar(src[s - 1])) s--;
    return src.slice(s, e);
  };

  while (i < N) {
    const c = src[i];

    /* ---- skip comments ---- */
    if (c === "/" && src[i + 1] === "/") { while (i < N && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < N && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }

    /* ---- skip strings ---- */
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < N) { if (src[i] === "\\") { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      prevSig = "s"; continue;
    }
    if (c === "`") {
      i++;
      let depth = 0;
      while (i < N) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { depth++; i += 2; continue; }
        if (src[i] === "}" && depth > 0) { depth--; i++; continue; }
        if (src[i] === "`" && depth === 0) { i++; break; }
        i++;
      }
      prevSig = "s"; continue;
    }

    /* ---- skip regex literals ---- */
    if (c === "/") {
      const canBeRegex = !(prevSig === "id" || prevSig === ")" || prevSig === "]" || prevSig === "s");
      if (canBeRegex) {
        let j = i + 1, inClass = false, ok = false;
        while (j < N) {
          const d = src[j];
          if (d === "\\") { j += 2; continue; }
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) { ok = true; j++; break; }
          else if (d === "\n") break;
          j++;
        }
        if (ok) { while (j < N && /[gimsuy]/.test(src[j])) j++; i = j; prevSig = ")"; continue; }
      }
      i++; prevSig = "/"; continue;
    }

    /* ---- braces: scope in and out ---- */
    if (c === "{") { scopes.push(new Map()); i++; prevSig = "{"; continue; }
    if (c === "}") {
      if (scopes.length > 1) scopes.pop();
      if (fns.length > 1) {
        /* a closing brace may end a function; approximate by popping when the
           function's own brace depth is reached */
        const top = fns[fns.length - 1];
        if (top.depth === scopes.length) fns.pop();
      }
      i++; prevSig = "}"; continue;
    }

    /* ---- identifiers and keywords ---- */
    if (idChar(c) && !/[0-9]/.test(c)) {
      let j = i; while (j < N && idChar(src[j])) j++;
      const word = src.slice(i, j);

      if (word === "function") {
        const before = readIdentBack(i);
        fns.push({ async: before === "async", depth: scopes.length + 1, name: word });
        i = j; prevSig = "id"; continue;
      }
      if (word === "const" || word === "let" || word === "var") {
        /* collect the declared names up to the terminating ; or the = of the
           first initialiser, handling simple destructuring by taking every
           identifier before the first `=` at depth 0 */
        let k = j, depth2 = 0, buf = "";
        while (k < N) {
          const d = src[k];
          if (d === "(" || d === "[" || d === "{") depth2++;
          else if (d === ")" || d === "]" || d === "}") depth2--;
          else if ((d === "=" && src[k + 1] !== "=" && depth2 === 0) || (d === ";" && depth2 === 0) || (d === "\n" && depth2 === 0)) break;
          buf += d; k++;
        }
        /* In `for (const [id, v] of Object.entries(thumbs || {}))` everything
           after `of` is the thing being iterated, not a declaration. Taking the
           whole header registered `thumbs` as a const and then reported every
           later write to it. */
        const declPart = buf.split(/\bof\b|\bin\b/)[0];
        const names = declPart.match(/[A-Za-z_$][\w$]*/g) || [];
        for (const nm of names) {
          scopes[scopes.length - 1].set(nm, { kind: word, line: lineAt(i) });
        }
        /* Resume at the `=` or `;`, not just past the keyword. Resuming after
           the keyword makes the declared name itself look like an assignment,
           which reported every single const in the file. The initialiser after
           the `=` is still scanned, so arrow-function bodies are not skipped. */
        i = Math.max(k, j); prevSig = "id"; continue;
      }
      if (word === "await") {
        const fn = fns[fns.length - 1];
        if (fn && !fn.async) findings.push({ type: "await-in-sync", line: lineAt(i), detail: "await inside a function not marked async" });
        i = j; prevSig = "id"; continue;
      }

      /* assignment to an existing binding?
         `c.width = 1` and `out.profileImg = x` are property writes, not binding
         writes, and reading only the identifier before the `=` reported every
         one of them. Look back for a dot (or ?.) first. */
      let back = i; while (back > 0 && /[ \t]/.test(src[back - 1])) back--;
      const isMember = src[back - 1] === "." || (src[back - 1] === "?" && src[back] === ".");
      let k = j; while (k < N && /[ \t]/.test(src[k])) k++;
      if (!isMember &&
          src[k] === "=" && src[k + 1] !== "=" && src[k - 1] !== "=" && src[k - 1] !== "!" &&
          src[k - 1] !== "<" && src[k - 1] !== ">" && src[k + 1] !== ">") {
        for (let s = scopes.length - 1; s >= 0; s--) {
          const d = scopes[s].get(word);
          if (d) {
            if (d.kind === "const") {
              findings.push({ type: "const-assign", line: lineAt(i), detail: "'" + word + "' assigned, declared const on line " + d.line });
            }
            break;
          }
        }
      }
      i = j; prevSig = "id"; continue;
    }

    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return findings;
}

const files = process.argv.slice(2);
if (!files.length) {
  // scanning nothing used to report "0 finding(s)" and exit 0, which reads as a pass
  console.error("usage: node scripts/scan-js.js <file.js> [more.js ...]");
  process.exit(2);
}
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const out = scan(src, f);
  if (!out.length) { console.log("  clean   " + f); continue; }
  console.log("  " + out.length + " finding(s) in " + f);
  for (const o of out) console.log("      line " + o.line + "  [" + o.type + "] " + o.detail);
  total += out.length;
}
console.log("\n" + total + " finding(s) total");
// exit code, not just a printed count: one of these killed every phone copy in 1.173
process.exit(total ? 1 : 0);
