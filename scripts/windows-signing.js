/* Authenticode support for the packaged app, setup runtime and final installer.
   No secret is stored in the repository. Configure either a PFX or a certificate
   already installed in the Windows certificate store:

     ROLECRAFT_WINDOWS_CERTIFICATE=C:\secure\rolecraft.pfx
     ROLECRAFT_WINDOWS_CERTIFICATE_PASSWORD=...

   or ROLECRAFT_WINDOWS_CERTIFICATE_SHA1=<thumbprint>. Set
   ROLECRAFT_REQUIRE_AUTHENTICODE=1 in release environments to fail closed when
   a trusted certificate is unavailable. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function findSignTool() {
  const roots = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Windows Kits", "10", "bin"),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory())
      .map(e => e.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(root, version, "x64", "signtool.exe");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "signtool.exe";
}

function signWindowsFile(file) {
  const pfx = process.env.ROLECRAFT_WINDOWS_CERTIFICATE;
  const thumbprint = process.env.ROLECRAFT_WINDOWS_CERTIFICATE_SHA1;
  const required = process.env.ROLECRAFT_REQUIRE_AUTHENTICODE === "1";
  if (!pfx && !thumbprint) {
    if (required) throw new Error("Authenticode signing is required, but no Rolecraft Windows certificate is configured");
    console.warn("Authenticode signing skipped for " + path.basename(file) + " (no trusted certificate configured).");
    return false;
  }
  if (pfx && !fs.existsSync(pfx)) throw new Error("Authenticode certificate was not found at the configured path");
  const tool = findSignTool();
  const args = ["sign", "/fd", "SHA256", "/td", "SHA256", "/tr",
    process.env.ROLECRAFT_TIMESTAMP_URL || "http://timestamp.digicert.com", "/d", "Rolecraft Vault"];
  if (pfx) {
    args.push("/f", pfx);
    if (process.env.ROLECRAFT_WINDOWS_CERTIFICATE_PASSWORD) {
      args.push("/p", process.env.ROLECRAFT_WINDOWS_CERTIFICATE_PASSWORD);
    }
  } else {
    args.push("/sha1", thumbprint.replace(/\s/g, ""));
  }
  args.push(file);
  execFileSync(tool, args, { stdio: "inherit" });
  execFileSync(tool, ["verify", "/pa", "/all", file], { stdio: "inherit" });
  console.log("Authenticode signed and verified " + path.basename(file) + ".");
  return true;
}

module.exports = { findSignTool, signWindowsFile };
