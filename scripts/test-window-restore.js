/* The window has to come back somewhere you can see it.

   A saved position is only good while the screen it was on still exists.
   Undock a laptop, unplug a second monitor, or let Windows renumber the
   displays, and the window is restored to coordinates that are now off every
   screen. Electron honours them exactly: the process starts, a window exists,
   and nothing appears. It reads as "I relaunched and it just didn't open".

   onScreenBounds is lifted out of app/main.js and run against real display
   geometry, so this tests the code that ships. Needs Electron.

   main.js is CRLF, so the lift matches single lines rather than a block. */
const { app, screen } = require("electron");
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "app", "main.js"), "utf8");
const start = SRC.indexOf("function onScreenBounds(");
if (start < 0) {
  // nothing checks the saved position against the displays, which is the bug
  console.log("  FAIL  main.js restores the saved position without asking where the screens are.");
  console.log("        A window last closed on a monitor that is now gone reopens off screen:");
  console.log("        the process runs, a window exists, and nothing appears.");
  process.exit(1);
}
let d = 0, end = start;
for (let i = SRC.indexOf("{", start); i < SRC.length; i++) {
  if (SRC[i] === "{") d++;
  else if (SRC[i] === "}") { d--; if (d === 0) { end = i + 1; break; } }
}
const lifted = SRC.slice(start, end);

app.whenReady().then(() => {
  const onScreenBounds = new Function("screen", lifted + "; return onScreenBounds;")(screen);
  const displays = screen.getAllDisplays().map(x => x.workArea);
  const visible = b => b && typeof b.x === "number" && displays.some(a =>
    b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);

  console.log("lifted onScreenBounds (" + lifted.length + " chars) from main.js");
  console.log("displays: " + displays.map(a => a.width + "x" + a.height + " at " + a.x + "," + a.y).join("  |  "));
  console.log("");

  const first = displays[0];
  /* A hosted Windows runner has only a 1024x720 virtual display. Keep the
     deliberately valid case inside the real work area instead of assuming a
     desktop large enough for a 1000x700 client window. */
  const fittingWidth = Math.max(240, Math.min(1000, first.width - 80));
  const fittingHeight = Math.max(240, Math.min(700, first.height - 80));
  const CASES = [
    { name: "a position still on screen",
      saved: { x: first.x + 40, y: first.y + 40, width: fittingWidth, height: fittingHeight }, keep: true },
    { name: "far off to the left (monitor unplugged)",
      saved: { x: -4200, y: -3000, width: 1280, height: 820 } },
    { name: "far off to the right",
      saved: { x: first.x + first.width + 2000, y: first.y + 200, width: 1280, height: 820 } },
    { name: "just below the desktop",
      saved: { x: first.x + 100, y: first.y + first.height + 900, width: 1280, height: 820 } },
    { name: "bigger than the screen it lands on",
      saved: { x: -9000, y: -9000, width: 99999, height: 99999 } },
    { name: "no position recorded yet", saved: { width: 1280, height: 820 } },
    { name: "nothing saved at all", saved: null },
  ];

  let bad = 0;
  for (const c of CASES) {
    const out = onScreenBounds(c.saved);
    let ok, note;
    if (c.saved === null) { ok = out === null; note = ok ? "left alone" : "should stay null"; }
    else if (typeof c.saved.x !== "number") { ok = out === c.saved; note = ok ? "left alone" : "should be untouched"; }
    else if (c.keep) { ok = out.x === c.saved.x && out.y === c.saved.y; note = ok ? "left where it was" : "moved a window that was fine"; }
    else {
      ok = visible(out);
      note = ok ? "brought back to x=" + out.x + " y=" + out.y + " " + out.width + "x" + out.height
                : "STILL OFF SCREEN (x=" + out.x + " y=" + out.y + ")";
    }
    // whatever it returns must fit the display it claims
    if (ok && out && typeof out.x === "number") {
      const a = screen.getDisplayMatching(out).workArea;
      if (out.width > a.width || out.height > a.height) { ok = false; note = "larger than the screen it is on"; }
    }
    if (!ok) bad++;
    console.log("  " + (ok ? "PASS" : "FAIL") + "  " + c.name.padEnd(38) + note);
  }

  console.log("");
  console.log(bad
    ? "  " + bad + " case(s) leave the window where nobody can see it."
    : "  The window always comes back on a screen that exists.");
  app.exit(bad ? 1 : 0);
});
