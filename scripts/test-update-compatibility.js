/* A cumulative .rcvup must not jump over a release that changed the Windows
   shell. Lift the real comparison and gate from main.js so the regression tests
   what installed copies actually execute. */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");

function lift(name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("could not find " + name + " in app/main.js");
  let depth = 0, end = start;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const real = new Function(lift("compareBuildVersions") + "\n" + lift("updateNeedsNewerShell") +
  "; return { compareBuildVersions, updateNeedsNewerShell };")();

let bad = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log("  " + (ok ? "PASS" : "FAIL") + "  " + label + "  got=" + got + " want=" + want);
}

console.log("\ncumulative Windows update compatibility");
const modern = { minShellBuild: "1.245", needsShell: true, shellBuild: "1.245" };
check("a 1.242 shell cannot skip the required 1.245 shell", real.updateNeedsNewerShell(modern, "1.242"), true);
check("the required shell accepts the cumulative renderer", real.updateNeedsNewerShell(modern, "1.245"), false);
check("a later full installer also accepts it", real.updateNeedsNewerShell(modern, "1.246"), false);
check("an unknown installed build fails closed", real.updateNeedsNewerShell(modern, "broken"), true);
check("a legacy shell-changing package keeps its exact guard",
  real.updateNeedsNewerShell({ needsShell: true, shellBuild: "1.243" }, "1.242"), true);
check("a legacy renderer-only package remains backward compatible",
  real.updateNeedsNewerShell({ needsShell: false, shellBuild: "1.244" }, "1.242"), false);

check("the signer authenticates a minimum shell floor", /"meta:minShellBuild"/.test(
  fs.readFileSync(path.join(__dirname, "sign-update.js"), "utf8")), true);

console.log("\n" + (bad ? bad + " compatibility case(s) failed." : "Cumulative updates cannot skip a required Windows shell."));
process.exit(bad ? 1 : 0);
