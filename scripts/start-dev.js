const path = require("path");
const { spawn, execFile } = require("child_process");

process.env.APPLICATION_INSIGHTS_NO_DIAGNOSTIC_CHANNEL = "1";
process.env.APPLICATION_INSIGHTS_NO_STATSBEAT = "1";

const _origWarn = console.warn;
console.warn = function (...args) {
    const msg = args.map(a => typeof a === 'string' ? a : '').join(' ');
    if (msg.includes('ApplicationInsights')) return;
    _origWarn.apply(console, args);
};

const projectRoot = path.resolve(__dirname, "..");
const expectedCommands = {
  3000: ["webpack", "serve"],
  3001: ["server.js"],
};

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

async function findListeningPid(port) {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const script = `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess`;
    const output = await execFileAsync("powershell", ["-NoProfile", "-Command", script]);
    const pid = Number(String(output || "").trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function getProcessCommandLine(pid) {
  if (!pid || process.platform !== "win32") {
    return "";
  }

  try {
    const script = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`;
    const output = await execFileAsync("powershell", ["-NoProfile", "-Command", script]);
    return String(output || "").trim();
  } catch {
    return "";
  }
}

async function classifyPort(port) {
  if (process.platform === "win32") {
    const pid = await findListeningPid(port);
    if (!pid) {
      return { status: "free", pid: null, commandLine: "" };
    }

    const commandLine = await getProcessCommandLine(pid);
    const normalized = commandLine.toLowerCase();
    const expected = expectedCommands[port].every((token) =>
      normalized.includes(token.toLowerCase())
    );

    return {
      status: expected ? "reusable" : "occupied",
      pid,
      commandLine,
    };
  }

  return { status: "free", pid: null, commandLine: "" };
}

function spawnManaged(command, args, label) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  console.log(`[start-dev] started ${label}`);
  return child;
}

async function main() {
  const frontend = await classifyPort(3000);
  const backend = await classifyPort(3001);

  if (frontend.status === "occupied") {
    console.error("[start-dev] port 3000 is in use by another process.");
    if (frontend.pid) {
      console.error(`[start-dev] pid=${frontend.pid} command=${frontend.commandLine || "unknown"}`);
    }
    process.exit(1);
  }

  if (backend.status === "occupied") {
    console.error("[start-dev] port 3001 is in use by another process.");
    if (backend.pid) {
      console.error(`[start-dev] pid=${backend.pid} command=${backend.commandLine || "unknown"}`);
    }
    process.exit(1);
  }

  const children = [];

  if (backend.status === "reusable") {
    console.log("[start-dev] reusing existing API service on port 3001");
  } else {
    children.push(spawnManaged("node", ["server.js"], "API service"));
  }

  if (frontend.status === "reusable") {
    console.log("[start-dev] reusing existing webpack dev server on port 3000");
  } else {
    children.push(spawnManaged("npx", ["webpack", "serve", "--mode", "development"], "webpack dev server"));
  }

  if (children.length === 0) {
    console.log("[start-dev] both development services are already running");
    return;
  }

  const shutdown = () => {
    children.forEach((child) => {
      if (!child.killed) {
        child.kill();
      }
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[start-dev] failed to start development services", error);
  process.exit(1);
});
