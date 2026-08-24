const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFileSync, spawn } = require("child_process");

const APP_NAME = "Rolecraft Vault";
const APP_EXE = "Rolecraft Vault.exe";
const COMPANY = "Rolecraft";

function payloadDir() {
  const packed = path.join(process.resourcesPath, "payload");
  if (fs.existsSync(path.join(packed, APP_EXE))) return packed;
  const staged = path.join(__dirname, "..", "dist", "Rolecraft Vault");
  if (fs.existsSync(path.join(staged, APP_EXE))) return staged;
  return null;
}

function defaultDir() {
  return path.join(process.env["ProgramFiles"] || "C:\\Program Files", APP_NAME);
}

function folderSize(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    n += ent.isDirectory() ? folderSize(p) : (fs.statSync(p).size || 0);
  }
  return n;
}

function walkFiles(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function makeShortcut(lnk, target, icon) {
  const ps = [
    "$ws = New-Object -ComObject WScript.Shell",
    `$s = $ws.CreateShortcut('${lnk.replace(/'/g, "''")}')`,
    `$s.TargetPath = '${target.replace(/'/g, "''")}'`,
    `$s.WorkingDirectory = '${path.dirname(target).replace(/'/g, "''")}'`,
    `$s.IconLocation = '${icon.replace(/'/g, "''")}'`,
    "$s.Save()"
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { windowsHide: true });
}

function writeUninstaller(dest, version) {
  const exe = path.join(dest, APP_EXE);
  const ico = path.join(dest, "resources", "app", "icon.ico");
  // PUBLIC is C:\Users\Public, not the desktop inside it. Joining the .lnk
  // straight onto it wrote the shortcut where nothing shows it.
  const desktop = path.join(process.env.PUBLIC || process.env.USERPROFILE, "Desktop", APP_NAME + ".lnk");
  const startDir = path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME);
  const ps1 = path.join(dest, "Uninstall-RolecraftVault.ps1");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    `$r = [System.Windows.Forms.MessageBox]::Show("Remove ${APP_NAME} from this computer?\`n\`nYour vault data in AppData is left alone.","${APP_NAME}","YesNo","Question")`,
    'if ($r -ne "Yes") { exit 0 }',
    `Remove-Item -LiteralPath '${desktop.replace(/'/g, "''")}' -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -LiteralPath '${startDir.replace(/'/g, "''")}' -Recurse -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -LiteralPath 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}' -Recurse -Force -ErrorAction SilentlyContinue`,
    `Remove-Item -LiteralPath 'HKCU:\\Software\\${APP_NAME}' -Recurse -Force -ErrorAction SilentlyContinue`,
    `$dest = '${dest.replace(/'/g, "''")}'`,
    'Start-Process -FilePath "$env:WINDIR\\System32\\cmd.exe" -ArgumentList @("/c","ping 127.0.0.1 -n 2 > nul & rd /s /q `"$dest`"") -WindowStyle Hidden',
    "exit 0"
  ].join("\r\n");
  fs.writeFileSync(ps1, script, "utf8");

  const unCmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1}"`;
  const key = `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`;
  const add = (name, type, value) => {
    execFileSync("reg.exe", ["add", key, "/v", name, "/t", type, "/d", value, "/f"], { windowsHide: true });
  };
  add("DisplayName", "REG_SZ", APP_NAME);
  add("Publisher", "REG_SZ", COMPANY);
  add("DisplayVersion", "REG_SZ", version);
  add("InstallLocation", "REG_SZ", dest);
  add("DisplayIcon", "REG_SZ", fs.existsSync(ico) ? ico : exe);
  add("UninstallString", "REG_SZ", unCmd);
  add("NoModify", "REG_DWORD", "1");
  add("NoRepair", "REG_DWORD", "1");
}

function copyPayload(src, dest, onProgress) {
  const files = walkFiles(src, []);
  const total = files.reduce((n, f) => n + (fs.statSync(f).size || 0), 0) || 1;
  let done = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (let i = 0; i < files.length; i++) {
    const rel = path.relative(src, files[i]);
    const out = path.join(dest, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(files[i], out);
    done += fs.statSync(files[i]).size || 0;
    if (onProgress) onProgress({ done, total, file: rel, n: i + 1, count: files.length });
  }
}

let win = null;
let installedDir = null;
const version = (() => {
  try { return require("./package.json").version; } catch (e) { return "1.0"; }
})();

function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const targetW = 1680, targetH = 945;
  let w = targetW, h = targetH;
  if (wa.width < targetW + 32 || wa.height < targetH + 32) {
    const scale = Math.min((wa.width - 40) / targetW, (wa.height - 40) / targetH, 1);
    w = Math.max(1180, Math.round(targetW * scale));
    h = Math.max(680, Math.round(targetH * scale));
  }
  win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 1100,
    minHeight: 680,
    frame: false,
    resizable: false,
    backgroundColor: "#070a12",
    roundedCorners: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.center();
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

ipcMain.handle("setup-info", () => {
  const payload = payloadDir();
  const dest = defaultDir();
  return {
    version,
    defaultDir: dest,
    payloadOk: !!payload,
    payloadBytes: payload ? folderSize(payload) : 0,
    alreadyInstalled: fs.existsSync(path.join(dest, APP_EXE))
  };
});

ipcMain.handle("setup-pick-dir", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Install Rolecraft Vault to…",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: defaultDir()
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return path.join(r.filePaths[0], path.basename(r.filePaths[0]) === APP_NAME ? "" : APP_NAME);
});

ipcMain.handle("setup-install", async (_e, dir) => {
  const src = payloadDir();
  if (!src) return { ok: false, error: "Setup is missing the app payload. Rebuild the installer." };
  const dest = path.normalize(String(dir || defaultDir()));
  try {
    fs.mkdirSync(dest, { recursive: true });
    const t = fs.openSync(path.join(dest, ".write-test"), "w");
    fs.closeSync(t);
    fs.unlinkSync(path.join(dest, ".write-test"));
  } catch (e) {
    return { ok: false, error: "Cannot write to that folder. Try running setup as administrator, or pick a different location." };
  }
  try {
    copyPayload(src, dest, p => {
      if (win && !win.isDestroyed()) win.webContents.send("setup-progress", p);
    });
    const exe = path.join(dest, APP_EXE);
    const ico = path.join(dest, "resources", "app", "icon.ico");
    // PUBLIC is C:\Users\Public, not the desktop inside it. Joining the .lnk
    // straight onto it wrote the shortcut where nothing shows it.
    const desktop = path.join(process.env.PUBLIC || process.env.USERPROFILE, "Desktop", APP_NAME + ".lnk");
    const startDir = path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME);
    fs.mkdirSync(startDir, { recursive: true });
    makeShortcut(desktop, exe, fs.existsSync(ico) ? ico : exe);
    makeShortcut(path.join(startDir, APP_NAME + ".lnk"), exe, fs.existsSync(ico) ? ico : exe);
    writeUninstaller(dest, version);
    installedDir = dest;
    return { ok: true, dest };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("setup-launch", () => {
  const dest = installedDir || defaultDir();
  const exe = path.join(dest, APP_EXE);
  if (!fs.existsSync(exe)) return { ok: false };
  spawn(path.join(process.env.WINDIR || "C:\\Windows", "explorer.exe"), [exe], { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
});

ipcMain.handle("setup-quit", () => {
  app.quit();
});
