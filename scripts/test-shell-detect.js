/* Rule 4: renderer changes ship as a .rcvup patch, shell changes need the full
   installer. npm run sign decides which by diffing against the last release tag.

   The decision is not retyped here — shellChangedSinceLastRelease is lifted out
   of scripts/sign-update.js and run against throwaway git repositories, so this
   tests the code that actually gates a release.

   app/vendor/ is the case worth having: a .rcvup carries app.js alone, so a
   changed font, crest or React build reaches nobody. That went undetected long
   enough to ship a broken crest. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC = fs.readFileSync(path.join(__dirname, "sign-update.js"), "utf8");

/* lift the function by name, brace-matching to its end */
const start = SRC.indexOf("function shellChangedSinceLastRelease()");
if (start < 0) throw new Error("could not find shellChangedSinceLastRelease in sign-update.js");
let depth = 0, end = start;
for (let i = SRC.indexOf("{", start); i < SRC.length; i++) {
  if (SRC[i] === "{") depth++;
  else if (SRC[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const lifted = SRC.slice(start, end);
const isReleaseTag = require("vm").runInNewContext(SRC.match(/const isReleaseTag = ([^\n]+);/)[1]);
console.log("lifted shellChangedSinceLastRelease (" + lifted.length + " chars) from sign-update.js");

/* it closes over `root`, `version` and `execFileSync` */
const make = (root, version) =>
  new Function("root", "version", "execFileSync", "isReleaseTag",
    lifted + "; return shellChangedSinceLastRelease;")(root, version, execFileSync, isReleaseTag);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rcv-shell-"));
const git = (repo, args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });

/* a throwaway repo shaped like the real one, tagged v1.000 */
function repo(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, "app", "vendor"), { recursive: true });
  const w = (rel, s) => fs.writeFileSync(path.join(dir, rel), s);
  w("app/main.js", 'const FACTORY_BUILD = "1.000";\nconst x = 1;\n');
  w("app/preload.js", "// preload\n");
  w("app/index.html", "<html></html>\n");
  w("app/vendor/crest-256.png", "PNG-BYTES-v1");
  w("app/app.js", "// the interface\n");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["config", "core.autocrlf", "false"]); // otherwise every add warns about line endings
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "release"]);
  git(dir, ["tag", "v1.000"]);
  return { dir, w, commit: () => { git(dir, ["add", "-A"]); git(dir, ["commit", "-qm", "work"]); } };
}

let bad = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + "   needsShell=" + got + " (want " + want + ")");
};

console.log("");

// 1. nothing changed since the tag
{
  const r = repo("clean");
  check("nothing changed since the tag", make(r.dir, "1.001")().needsShell, false);
}

// 2. only the version stamp moved — set-version rewrites it every single release
{
  const r = repo("stamp");
  r.w("app/main.js", 'const FACTORY_BUILD = "1.001";\nconst x = 1;\n');
  r.commit();
  check("only the FACTORY_BUILD stamp moved", make(r.dir, "1.001")().needsShell, false);
}

// 3. a real change to main.js
{
  const r = repo("main");
  r.w("app/main.js", 'const FACTORY_BUILD = "1.001";\nconst x = 2;\n');
  r.commit();
  check("a real line changed in main.js", make(r.dir, "1.001")().needsShell, true);
}

// 4. preload.js
{
  const r = repo("preload");
  r.w("app/preload.js", "// preload, changed\n");
  r.commit();
  check("preload.js changed", make(r.dir, "1.001")().needsShell, true);
}

// 5. app.js alone is exactly what a patch is for
{
  const r = repo("appjs");
  r.w("app/app.js", "// the interface, changed\n");
  r.commit();
  check("app.js alone still ships as a patch", make(r.dir, "1.001")().needsShell, false);
}

// 6. the one nothing used to catch
{
  const r = repo("vendor");
  r.w("app/vendor/crest-256.png", "PNG-BYTES-v2-A-DIFFERENT-CREST");
  r.commit();
  const got = make(r.dir, "1.001")();
  check("a changed crest in app/vendor/ needs the installer", got.needsShell, true);
  check("  and it is named", got.vendor.includes("app/vendor/crest-256.png"), true);
}

// 7. a brand new vendor file, not just a modified one
{
  const r = repo("vendor-new");
  r.w("app/vendor/inter-400.woff2", "FONT");
  r.commit();
  check("a new font in app/vendor/ needs the installer", make(r.dir, "1.001")().needsShell, true);
}

// A non-release tag must not become the shell compatibility baseline.
{
  const r = repo("preview-tag");
  r.w("app/main.js", 'const FACTORY_BUILD = "1.000";\nconst x = 2;\n'); r.commit();
  git(r.dir, ["tag", "v9.999-preview"]);
  r.w("app/main.js", 'const FACTORY_BUILD = "1.000";\nconst x = 1;\n'); r.commit();
  const result = make(r.dir, "1.001")();
  check("non-release tags cannot change shell routing", result.tag === "v1.000" && result.needsShell === false, true);
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log("");
console.log(bad
  ? bad + " case(s) wrong — a release could be shipped as the wrong artifact."
  : "Every release is routed to the right artifact, app/vendor/ included.");
process.exit(bad ? 1 : 0);
