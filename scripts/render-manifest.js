#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dev") {
      out.dev = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      out.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg === "--base-url" && argv[i + 1]) {
      out.baseUrl = argv[++i];
      continue;
    }
    if (arg.startsWith("--app-domain=")) {
      out.appDomain = arg.slice("--app-domain=".length);
      continue;
    }
    if (arg === "--app-domain" && argv[i + 1]) {
      out.appDomain = argv[++i];
      continue;
    }
    if (arg.startsWith("--template=")) {
      out.templatePath = arg.slice("--template=".length);
      continue;
    }
    if (arg === "--template" && argv[i + 1]) {
      out.templatePath = argv[++i];
      continue;
    }
    if (arg.startsWith("--output=")) {
      out.outputPath = arg.slice("--output=".length);
      continue;
    }
    if (arg === "--output" && argv[i + 1]) {
      out.outputPath = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function ensureUrl(value, fieldName) {
  const trimmed = trimTrailingSlash(value);
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`${fieldName} must be an absolute http(s) URL: ${value}`);
  }
  return trimmed;
}

function usage() {
  console.log(`Usage: node scripts/render-manifest.js [options]

Options:
  --dev                      Render manifest for local dev (https://localhost:3000)
  --base-url <url>           Add-in base URL (overrides env MANIFEST_BASE_URL)
  --app-domain <url>         AppDomain URL (defaults to base URL / MANIFEST_APP_DOMAIN)
  --template <path>          Template path (default: manifest.template.xml)
  --output <path>            Output path (default: manifest.xml)
  -h, --help                 Show help

Environment variables:
  MANIFEST_BASE_URL          Add-in base URL, e.g. https://quotation.company:3001
  MANIFEST_APP_DOMAIN        AppDomain URL (optional; defaults to MANIFEST_BASE_URL)
  MANIFEST_TEMPLATE_PATH     Template file path (optional)
  MANIFEST_OUTPUT_PATH       Output file path (optional)
`);
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const defaultDevBase = "https://localhost:3000";
  const baseUrl = ensureUrl(
    args.baseUrl ||
      process.env.MANIFEST_BASE_URL ||
      (args.dev ? defaultDevBase : ""),
    "baseUrl"
  );
  const appDomain = ensureUrl(
    args.appDomain || process.env.MANIFEST_APP_DOMAIN || baseUrl,
    "appDomain"
  );

  const templatePath = path.resolve(
    repoRoot,
    args.templatePath || process.env.MANIFEST_TEMPLATE_PATH || "manifest.template.xml"
  );
  const outputPath = path.resolve(
    repoRoot,
    args.outputPath || process.env.MANIFEST_OUTPUT_PATH || "manifest.xml"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const template = fs.readFileSync(templatePath, "utf8");

  let rendered = template;
  if (rendered.includes("__ADDIN_BASE_URL__") || rendered.includes("__APP_DOMAIN__")) {
    rendered = rendered
      .replaceAll("__ADDIN_BASE_URL__", baseUrl)
      .replaceAll("__APP_DOMAIN__", appDomain);
  } else {
    // Backward-compatible fallback for legacy templates without placeholders.
    rendered = rendered
      .replace(
        /https:\/\/[^/"]+\/(assets\/icon-(16|32|64|80)\.png|taskpane\.html|commands\.html)/g,
        `${baseUrl}/$1`
      )
      .replace(/(<AppDomain>)https:\/\/[^<]+(<\/AppDomain>)/g, `$1${appDomain}$2`);
  }

  fs.writeFileSync(outputPath, rendered, "utf8");

  console.log(`[OK] manifest rendered`);
  console.log(`  template : ${templatePath}`);
  console.log(`  output   : ${outputPath}`);
  console.log(`  baseUrl  : ${baseUrl}`);
  console.log(`  appDomain: ${appDomain}`);
}

try {
  main();
} catch (error) {
  console.error(`[ERR] ${error.message || error}`);
  process.exit(1);
}
