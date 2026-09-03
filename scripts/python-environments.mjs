import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";

const DEPENDENCY_PROBE = `
import importlib, json, sys
packages = []
for name, module in [("torch", "torch"), ("torchvision", "torchvision"), ("timm", "timm"), ("numpy", "numpy"), ("scipy", "scipy"), ("Pillow", "PIL")]:
    try:
        loaded = importlib.import_module(module)
        packages.append({"name": name, "ok": True, "version": str(getattr(loaded, "__version__", "")), "error": None})
    except Exception as error:
        packages.append({"name": name, "ok": False, "version": None, "error": str(error)[:400]})
print("LP_ENV_RESULT " + json.dumps({"ok": all(item["ok"] for item in packages), "pythonPath": sys.executable, "version": sys.version.split()[0], "packages": packages}))
`;

export class PythonEnvironmentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function runExecutable(executable, args, timeoutMs = 90000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    let expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk.toString("utf8")).slice(-128000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (expired) reject(new PythonEnvironmentError("检查 Python 环境超时，请稍后重试或选择其他环境。"));
      else resolvePromise({ code, stdout, stderr });
    });
  });
}

export function createPythonEnvironmentManager({
  projectDir, env = process.env, home = homedir(), platform = process.platform,
  run = runExecutable,
}) {
  const windows = platform === "win32";
  const configPath = join(projectDir, ".env.python.local.json");
  const key = (path) => windows ? normalize(path).toLowerCase() : normalize(path);
  const inEnv = (path, venv = false) => join(path, windows ? (venv ? "Scripts/python.exe" : "python.exe") : "bin/python");
  let savedPath = null;
  let configError = null;
  let selecting = false;
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (typeof config.pythonPath !== "string" || !isAbsolute(config.pythonPath)) throw new Error("invalid pythonPath");
      savedPath = config.pythonPath;
    }
  } catch {
    configError = "上次保存的 Python 配置无法读取，请重新选择并应用环境。";
  }

  function discover() {
    const found = new Map();
    function add(path, source, name) {
      if (!path || !isAbsolute(path)) return;
      try {
        if (!statSync(path).isFile()) return;
      } catch { return; }
      const id = key(path);
      if (!found.has(id)) found.set(id, { path: resolve(path), source, name: name || basename(dirname(path)) });
    }
    add(savedPath, "saved", "上次选择");
    add(env.LP_PREDICT_PYTHON, "environment", "启动配置");
    add(inEnv(join(projectDir, ".venv"), true), "venv", "项目 .venv");
    if (env.CONDA_PREFIX) add(inEnv(env.CONDA_PREFIX), "conda", basename(env.CONDA_PREFIX));
    // Conda registers named environments here, including installations outside PATH.
    try {
      for (const prefix of readFileSync(join(home, ".conda", "environments.txt"), "utf8").split(/\r?\n/)) {
        if (prefix.trim()) add(inEnv(prefix.trim()), "conda", basename(prefix.trim()));
      }
    } catch { /* Conda is optional. */ }
    const roots = [join(home, ".conda"), ...["miniconda3", "anaconda3", "miniforge3", "mambaforge"].map((name) => join(home, name))];
    if (env.CONDA_EXE && isAbsolute(env.CONDA_EXE)) roots.push(dirname(dirname(env.CONDA_EXE)));
    if (env.CONDA_ENVS_PATH) roots.push(...env.CONDA_ENVS_PATH.split(windows ? ";" : ":").map((path) => ({ envs: path })));
    for (const root of roots) {
      const envsDir = typeof root === "string" ? join(root, "envs") : root.envs;
      if (typeof root === "string") add(inEnv(root), "conda", `${basename(root)} (base)`);
      try {
        for (const entry of readdirSync(envsDir, { withFileTypes: true })) {
          if (entry.isDirectory()) add(inEnv(join(envsDir, entry.name)), "conda", entry.name);
        }
      } catch { /* Skip unavailable environment directories. */ }
    }
    const searchPath = env.PATH || env.Path || "";
    for (const directory of searchPath.split(windows ? ";" : ":")) {
      const path = directory.replace(/^"|"$/g, "");
      if (!isAbsolute(path) || (windows && /[\\/]WindowsApps(?:[\\/]|$)/i.test(path))) continue;
      for (const name of windows ? ["python.exe", "python3.exe"] : ["python3", "python"]) {
        add(join(path, name), "path", `PATH · ${basename(path)}`);
      }
    }
    return [...found.values()];
  }

  function status() {
    const environments = discover();
    // A saved or explicitly configured interpreter must not silently fall back to another environment.
    const activePath = savedPath || env.LP_PREDICT_PYTHON || environments[0]?.path || null;
    return {
      environments, activePath,
      selectionSource: savedPath ? "saved" : env.LP_PREDICT_PYTHON ? "environment" : activePath ? "auto" : "none",
      configError: configError || (activePath && !environments.some((item) => key(item.path) === key(activePath))
        ? "当前配置的解释器不存在，请重新选择 Python 环境。" : null),
    };
  }

  function validatePath(value) {
    if (typeof value !== "string" || !value.trim()) throw new PythonEnvironmentError("请选择环境或填写 Python 解释器的完整路径。" );
    const path = value.trim();
    if (!isAbsolute(path) || !/^python(?:\d+(?:\.\d+)*)?(?:\.exe)?$/i.test(basename(path))) {
      throw new PythonEnvironmentError("请指定 python.exe（或 python / python3）的完整文件路径，而不是环境文件夹或命令。" );
    }
    if (!existsSync(path) || !statSync(path).isFile()) throw new PythonEnvironmentError("Python 解释器文件不存在，请检查路径。" );
    return resolve(path);
  }

  async function check(value) {
    const path = validatePath(value);
    let result;
    try {
      // Argument arrays and shell:false keep paths with spaces safe and prevent shell command expansion.
      result = await run(path, ["-I", "-c", DEPENDENCY_PROBE]);
    } catch (error) {
      throw new PythonEnvironmentError(`无法检查 Python 环境：${error.message}`);
    }
    const line = result.stdout.split(/\r?\n/).findLast((value) => value.startsWith("LP_ENV_RESULT "));
    if (result.code !== 0 || !line) {
      throw new PythonEnvironmentError(`Python 无法启动或依赖检查失败。${result.stderr ? ` ${result.stderr.slice(-800)}` : ""}`);
    }
    let report;
    try { report = JSON.parse(line.slice("LP_ENV_RESULT ".length)); }
    catch { throw new PythonEnvironmentError("Python 返回了无效的环境检查结果。" ); }
    if (typeof report.ok !== "boolean" || !Array.isArray(report.packages) || report.packages.length !== 6) {
      throw new PythonEnvironmentError("Python 返回了不完整的依赖检查结果。" );
    }
    return { ...report, pythonPath: path, ok: report.ok && report.packages.every((item) => item.ok === true) };
  }

  async function select(value) {
    if (selecting) throw new PythonEnvironmentError("正在应用另一个 Python 环境，请稍后重试。", 409);
    selecting = true;
    try {
      const report = await check(value);
      if (!report.ok) return { applied: false, report, ...status() };
      const temporary = `${configPath}.tmp`;
      await mkdir(projectDir, { recursive: true });
      await writeFile(temporary, `${JSON.stringify({ pythonPath: report.pythonPath }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, configPath);
      savedPath = report.pythonPath;
      configError = null;
      return { applied: true, report, ...status() };
    } finally { selecting = false; }
  }

  return {
    status, check, select,
    executable() {
      const path = status().activePath;
      if (!path) throw new PythonEnvironmentError("未找到可用的 Python 环境，请点击网页顶部“Python 环境”选择 conda 环境。" );
      return validatePath(path);
    },
  };
}
