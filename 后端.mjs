import { existsSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { get } from "node:http";
import { createInterface } from "node:readline";

const projectDir = dirname(fileURLToPath(import.meta.url));
const bundledRoot = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies");
const bundledNode = join(bundledRoot, "node", "bin");
const bundledPnpm = join(bundledRoot, "bin", "fallback", "pnpm.cmd");
const isWindows = process.platform === "win32";
const pnpm = existsSync(bundledPnpm) ? bundledPnpm : isWindows ? "pnpm.cmd" : "pnpm";
const runtimeStatePath = join(projectDir, ".lp-backend-runtime.json");
const vinextLockPath = join(projectDir, ".vinext", "dev", "lock.json");
const cleanupScript = join(projectDir, "scripts", "cleanup-backend.ps1");

if (existsSync(bundledNode)) {
  process.env.Path = bundledNode + ";" + (process.env.Path || "");
  process.env.PATH = process.env.Path;
}

function runPnpm(args) {
  return spawnSync(pnpm, args, {
    cwd: projectDir,
    stdio: "inherit",
    shell: isWindows,
  });
}

if (isWindows && existsSync(cleanupScript)) {
  const cleanup = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", cleanupScript], {
    cwd: projectDir,
    stdio: "inherit",
    windowsHide: true,
  });
  if (cleanup.status !== 0) {
    console.error("\n无法清理上次遗留的后端进程，请查看上面的错误信息。");
    process.exit(cleanup.status || 1);
  }
}

console.log("=".repeat(58));
console.log("少模光纤仿真后端启动脚本");
console.log("后端地址：http://localhost:3000");
console.log("启动完成后，请双击“前端.html”");
console.log("=".repeat(58));

if (!existsSync(join(projectDir, "node_modules"))) {
  console.log("\n首次运行，正在安装项目依赖…\n");
  const install = runPnpm(["install"]);
  if (install.status !== 0) {
    console.error("\n依赖安装失败，请确认 Node.js 与 pnpm 可用。");
    process.exit(install.status || 1);
  }
}

const vinextCli = join(projectDir, "node_modules", "vinext", "dist", "cli.js");
const child = spawn(process.execPath, [vinextCli, "dev", "--host", "127.0.0.1"], {
  cwd: projectDir,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

// 模态预测旁路服务：普通 Node.js 进程，负责模型扫描与 Python 推理。
const predictionServer = spawn(process.execPath, [join(projectDir, "prediction-server.mjs")], {
  cwd: projectDir,
  stdio: "inherit",
  shell: false,
  env: process.env,
});

const launchedAt = Date.now();
function saveRuntimeState() {
  const temporaryPath = `${runtimeStatePath}.${process.pid}.tmp`;
  const state = {
    projectDir,
    supervisorPid: process.pid,
    processes: [
      { label: "web server", pid: child.pid, startedAt: launchedAt },
      { label: "prediction server", pid: predictionServer.pid, startedAt: launchedAt },
    ],
  };
  try {
    writeFileSync(temporaryPath, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporaryPath, runtimeStatePath);
  } catch (error) {
    try { unlinkSync(temporaryPath); } catch {}
    console.warn(`警告：无法保存后端运行记录，下次异常启动时可能需要手动清理端口。${error instanceof Error ? `（${error.message}）` : ""}`);
  }
}

function clearRuntimeState() {
  try { unlinkSync(runtimeStatePath); } catch {}
}

function clearVinextLock() {
  try { unlinkSync(vinextLockPath); } catch {}
}

saveRuntimeState();

const commandLine = createInterface({ input: process.stdin, output: process.stdout });

if (process.stdin.isTTY) {
  console.log("输入 q、quit 或 exit 后按回车，可安全退出后端。\n");
}
commandLine.on("line", (line) => {
  const command = line.trim().toLowerCase();
  if (["q", "quit", "exit"].includes(command)) {
    shutdown(0);
  } else if (command) {
    console.log("未知命令。输入 q、quit 或 exit 后按回车退出后端。");
  }
});
commandLine.on("SIGINT", () => shutdown(0));

let readyAnnounced = false;
function waitUntilReady() {
  if (readyAnnounced) return;
  const request = get("http://localhost:3000/", (response) => {
    response.resume();
    if (response.statusCode && response.statusCode < 500) {
      readyAnnounced = true;
      console.log("\n" + "★".repeat(20));
      console.log("后端已就绪！现在可以双击“前端.html”");
      console.log("★".repeat(20) + "\n");
    } else setTimeout(waitUntilReady, 700);
  });
  request.on("error", () => setTimeout(waitUntilReady, 700));
  request.setTimeout(1000, () => request.destroy());
}
waitUntilReady();

function waitUntilPredictionReady() {
  const request = get("http://127.0.0.1:3099/health", (response) => {
    response.resume();
    if (response.statusCode && response.statusCode < 500) {
      console.log("预测旁路服务已就绪（模型扫描 / Python 推理可用）");
    } else setTimeout(waitUntilPredictionReady, 700);
  });
  request.on("error", () => setTimeout(waitUntilPredictionReady, 700));
  request.setTimeout(1000, () => request.destroy());
}
waitUntilPredictionReady();

let shuttingDown = false;

function stopProcessTree(processHandle) {
  if (!processHandle?.pid || processHandle.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(processHandle.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  processHandle.kill("SIGTERM");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n正在关闭网页服务和预测服务…");
  commandLine?.close();
  child.removeAllListeners("exit");
  predictionServer.removeAllListeners("exit");
  stopProcessTree(child);
  stopProcessTree(predictionServer);
  clearRuntimeState();
  clearVinextLock();
  console.log("后端已安全退出。");
  process.exit(code ?? 0);
}
child.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});
predictionServer.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));
if (isWindows) process.on("SIGBREAK", () => shutdown(0));
