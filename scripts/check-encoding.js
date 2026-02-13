const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const TEXT_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".md",
  ".xml",
  ".yml",
  ".yaml",
]);

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "lib",
  "lib-amd",
  ".vscode",
]);

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTS.has(ext)) out.push(full);
  }
}

function hasUtf16Bom(buf) {
  return (
    (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) ||
    (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
  );
}

const files = [];
walk(ROOT, files);

const badFiles = [];
for (const file of files) {
  const buf = fs.readFileSync(file);
  if (hasUtf16Bom(buf)) {
    badFiles.push({
      file,
      reason: "UTF-16 BOM detected",
    });
    continue;
  }

  const text = buf.toString("utf8");
  if (text.includes("\uFFFD")) {
    badFiles.push({
      file,
      reason: "Contains replacement char (likely broken encoding)",
    });
  }
}

if (badFiles.length > 0) {
  console.error("Encoding check failed:");
  for (const item of badFiles) {
    console.error(`- ${path.relative(ROOT, item.file)}: ${item.reason}`);
  }
  process.exit(1);
}

console.log(`Encoding check passed (${files.length} text files).`);
