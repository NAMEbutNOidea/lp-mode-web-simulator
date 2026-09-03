import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createPythonEnvironmentManager } from "./python-environments.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "lp-python-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projectDir = join(root, "project");
  const home = join(root, "user");
  const prefix = join(home, ".conda", "envs", "模式分析 env");
  const pythonPath = join(prefix, process.platform === "win32" ? "python.exe" : "bin/python");
  mkdirSync(dirname(pythonPath), { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(pythonPath, "");
  writeFileSync(join(home, ".conda", "environments.txt"), `${prefix}\n`);
  const calls = [];
  const run = async (executable, args) => {
    calls.push({ executable, args });
    return { code: 0, stdout: `LP_ENV_RESULT ${JSON.stringify({
      ok: true, version: "3.12.0", pythonPath: executable,
      packages: ["torch", "torchvision", "timm", "numpy", "scipy", "Pillow"].map((name) => ({ name, ok: true, version: "1.0", error: null })),
    })}\n`, stderr: "" };
  };
  const options = { projectDir, home, env: {}, run };
  return { projectDir, home, pythonPath, calls, run, options, config: join(projectDir, ".env.python.local.json"), manager: createPythonEnvironmentManager(options) };
}

test("discovers registered conda environments once, including names with spaces and Unicode", (t) => {
  const { manager, pythonPath } = fixture(t);
  const status = manager.status();
  assert.equal(status.environments.length, 1);
  assert.equal(status.environments[0].path, pythonPath);
  assert.equal(status.environments[0].name, "模式分析 env");
  assert.equal(manager.executable(), pythonPath);
});

test("checking dependencies does not persist or change an environment", async (t) => {
  const { manager, pythonPath, config, calls } = fixture(t);
  assert.equal((await manager.check(pythonPath)).ok, true);
  assert.equal(existsSync(config), false);
  assert.equal(calls[0].executable, pythonPath);
  assert.deepEqual(calls[0].args.slice(0, 2), ["-I", "-c"]);
});

test("selection survives restart and overrides an old launcher environment variable", async (t) => {
  const { manager, pythonPath, config, options } = fixture(t);
  assert.equal((await manager.select(pythonPath)).applied, true);
  assert.equal(JSON.parse(readFileSync(config, "utf8")).pythonPath, pythonPath);
  const restarted = createPythonEnvironmentManager({ ...options, env: { LP_PREDICT_PYTHON: join(options.home, "old", "python.exe") } });
  assert.equal(restarted.executable(), pythonPath);
  assert.equal(restarted.status().selectionSource, "saved");
});

test("missing dependencies leave the persisted selection untouched", async (t) => {
  const { manager, pythonPath, config, options, run } = fixture(t);
  await manager.select(pythonPath);
  const before = readFileSync(config, "utf8");
  const failing = createPythonEnvironmentManager({ ...options, run: async (...args) => {
    const result = await run(...args);
    const report = JSON.parse(result.stdout.slice("LP_ENV_RESULT ".length));
    report.ok = false;
    report.packages[0] = { name: "torch", ok: false, version: null, error: "DLL load failed" };
    return { ...result, stdout: `LP_ENV_RESULT ${JSON.stringify(report)}\n` };
  } });
  const result = await failing.select(pythonPath);
  assert.equal(result.applied, false);
  assert.equal(result.report.packages[0].error, "DLL load failed");
  assert.equal(readFileSync(config, "utf8"), before);
});

test("rejects folders, relative paths, shell commands and missing executables before running anything", async (t) => {
  const { manager, pythonPath, calls, projectDir } = fixture(t);
  for (const value of [projectDir, "python", `${pythonPath} & echo unsafe`, join(projectDir, "python.exe"), join(projectDir, "cmd.exe")]) {
    await assert.rejects(manager.check(value));
  }
  assert.equal(calls.length, 0);
});

test("an unavailable saved path is reported instead of silently changing the environment", (t) => {
  const { config, options, projectDir } = fixture(t);
  writeFileSync(config, JSON.stringify({ pythonPath: join(projectDir, "missing", "python.exe") }));
  const restarted = createPythonEnvironmentManager(options);
  assert.match(restarted.status().configError, /不存在/);
  assert.throws(() => restarted.executable(), /不存在/);
});

test("invalid saved JSON can be repaired through a new selection", async (t) => {
  const { config, options, pythonPath } = fixture(t);
  writeFileSync(config, "{ invalid");
  const restarted = createPythonEnvironmentManager(options);
  assert.match(restarted.status().configError, /无法读取/);
  assert.equal((await restarted.select(pythonPath)).applied, true);
  assert.equal(restarted.status().configError, null);
});

test("simultaneous selections cannot overwrite each other", async (t) => {
  const { options, pythonPath, run } = fixture(t);
  let resume;
  const manager = createPythonEnvironmentManager({ ...options, run: (...args) => new Promise((resolve) => { resume = async () => resolve(await run(...args)); }) });
  const first = manager.select(pythonPath);
  await assert.rejects(manager.select(pythonPath), (error) => error.status === 409);
  await resume();
  assert.equal((await first).applied, true);
});
