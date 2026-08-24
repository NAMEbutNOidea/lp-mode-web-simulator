import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { get } from "node:http";

const projectDir = dirname(fileURLToPath(import.meta.url));
const bundledRoot = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies");
const bundledNode = join(bundledRoot, "node", "bin");
const bundledPnpm = join(bundledRoot, "bin", "fallback", "pnpm.cmd");
const isWindows = process.platform === "win32";
const pnpm = existsSync(bundledPnpm) ? bundledPnpm : isWindows ? "pnpm.cmd" : "pnpm";

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

const child = spawn(pnpm, ["dev", "--host", "127.0.0.1"], {
  cwd: projectDir,
  stdio: "inherit",
  shell: isWindows,
  env: process.env,
});

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

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
