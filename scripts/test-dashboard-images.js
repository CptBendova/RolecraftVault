/* Dashboard image priority and responsive intent.

   Performance mode used to skip the full Spotlight original without requesting
   its preview, so the picture could remain blank forever. This lifts the real
   queue helpers and verifies the order the Dashboard hands to the loader. */
const fs = require("fs");
const path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");

function lift(name) {
  const start = SRC.indexOf("function " + name);
  if (start < 0) throw new Error("could not find " + name);
  let depth = 0, end = start;
  for (let i = SRC.indexOf("{", start); i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  return SRC.slice(start, end);
}

const real = new Function(
  lift("prioritizeImageQueue") + "\n" + lift("dashboardImagePriority") +
  "\nreturn { prioritizeImageQueue, dashboardImagePriority };"
)();

let bad = 0;
const check = (name, condition, detail) => {
  console.log((condition ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
  if (!condition) bad++;
};

const ordered = real.dashboardImagePriority(
  { profileImg: "spotlight" },
  [{ imgId: "gallery-a" }, { imgId: "gallery-b" }, { imgId: "gallery-a" }]
);
check("Spotlight is first", ordered[0] === "spotlight", ordered.join(", "));
check("visible gallery pictures follow in display order",
  ordered.join(",") === "spotlight,gallery-a,gallery-b", ordered.join(", "));

const promoted = real.prioritizeImageQueue(
  ["old-card-a", "gallery-b", "old-card-b", "spotlight"], ordered
);
check("the Dashboard jumps ahead of an existing library queue",
  promoted.slice(0, 3).join(",") === ordered.join(","), promoted.join(", "));
check("priority does not duplicate an already queued picture",
  new Set(promoted).size === promoted.length);

const scheduleStart = SRC.indexOf("const wallVisible = wallShow.slice");
const scheduleEnd = SRC.indexOf("const reshuffle", scheduleStart);
const schedule = SRC.slice(scheduleStart, scheduleEnd);
check("the real Dashboard submits the priority batch in every graphics mode",
  /const dashboardImages = dashboardImagePriority\(spotlight, wallVisible\)/.test(schedule) &&
  /loadImagesFirst\(dashboardImages,/.test(schedule));
check("Spotlight alone may fall back to its original when no preview exists",
  /spotlight && spotlight\.profileImg \? \[spotlight\.profileImg\] : \[\]/.test(schedule));
check("a rotated Spotlight does not leave old originals exempt from the phone guard",
  /priorityOriginals\.current = new Set\(\(originalFallbacks \|\| \[\]\)\.filter\(Boolean\)\)/.test(SRC));
check("only the full original remains Quality-only",
  /if \(!PERF && spotlight && spotlight\.profileImg\) requestFull/.test(schedule));

console.log(bad ? "\n" + bad + " FAILED" : "\nDashboard pictures are queued in the order the user sees them.");
process.exit(bad ? 1 : 0);
