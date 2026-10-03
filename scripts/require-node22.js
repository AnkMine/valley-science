// Runs automatically after any `npm install` in this repo (root "postinstall").
// Two jobs, both cheap:
//   1. Block installs on Node older than 22 with a plain-language message.
//   2. Refresh the dependency stamps used by scripts/setup-dev.sh so the
//      next `npm run setup` knows this tree is current.
//
// The app needs Node 22 or newer (CI pins 22.14). See .nvmrc.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(
    "\nValley Science needs Node 22 or newer. This machine is running Node " +
      process.version +
      ".\n" +
      "Install Node 22 (the version in .nvmrc), then run: npm run setup\n"
  );
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
for (const area of ["frontend", "backend"]) {
  const pkg = path.join(root, area, "package.json");
  const lock = path.join(root, area, "package-lock.json");
  const mods = path.join(root, area, "node_modules");
  if (!fs.existsSync(pkg) || !fs.existsSync(lock) || !fs.existsSync(mods)) continue;
  // Fingerprint with Node itself so this works on any OS (no shasum needed).
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(pkg))
    .update(fs.readFileSync(lock))
    .digest("hex");
  fs.writeFileSync(path.join(mods, ".valley-deps-stamp"), hash + "\n");
}
