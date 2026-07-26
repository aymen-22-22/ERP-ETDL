// Fails the build if the generated PWA manifest is missing a field that
// makes the app non-installable — cheaper than discovering it in a browser
// devtools "Manifest" panel after every change.
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, "..", "dist", "manifest.webmanifest");

const REQUIRED_FIELDS = ["name", "short_name", "start_url", "display", "icons"];

async function main() {
  const raw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw);

  const missing = REQUIRED_FIELDS.filter((field) => !(field in manifest));
  if (missing.length > 0) {
    console.error(`Manifest is missing required field(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    console.error("Manifest must declare at least one icon.");
    process.exit(1);
  }

  console.log("Manifest OK:", REQUIRED_FIELDS.map((field) => `${field}=✓`).join(" "));
}

main().catch((error) => {
  console.error("Failed to validate manifest:", error);
  process.exit(1);
});
