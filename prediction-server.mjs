// 模态预测旁路服务。
// vinext dev 的路由处理器运行在 workerd 沙箱中，无法访问真实文件系统或启动
// Python 子进程；本服务以普通 Node.js 运行在 127.0.0.1:3099，承担模型扫描与
// 推理任务。由 后端.mjs 在启动 pnpm dev 的同时启动。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = process.env.LP_MODELS_DIR ? resolve(process.env.LP_MODELS_DIR) : join(PROJECT_DIR, "models");
const FIBER_PROFILES_DIR = process.env.LP_FIBER_PROFILES_DIR ? resolve(process.env.LP_FIBER_PROFILES_DIR) : join(PROJECT_DIR, "fiber-profiles");
const WORKER_PATH = join(PROJECT_DIR, "scripts", "predict_worker.py");
const MODEL_EXTENSIONS = new Set([".pth", ".pt", ".ckpt"]);

const PYTHON_CANDIDATES = [
  process.env.LP_PREDICT_PYTHON,
  "python",
  "py",
].filter(Boolean);

let cachedPython;

function findPython() {
  if (cachedPython !== undefined) return cachedPython;
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ["-c", "import sys; print(sys.version.split()[0])"], {
        encoding: "utf8",
        timeout: 15000,
        shell: candidate === "py",
        windowsHide: true,
      });
      if (result.status === 0 && result.stdout?.trim()) {
        cachedPython = candidate;
        return candidate;
      }
    } catch {
      // 尝试下一个候选
    }
  }
  cachedPython = null;
  return null;
}

function pythonHint() {
  return "未找到可用的 Python 环境（需要 torch / torchvision / timm / numpy / Pillow）。请在 启动后端.bat 中设置 LP_PREDICT_PYTHON（例如指向 conda 环境的 python.exe），或在 README 中查看配置说明。";
}

function runPython(job, timeoutMs = 300000, onProgress) {
  const python = findPython();
  if (!python) return Promise.resolve({ ok: false, error: pythonHint() });
  return new Promise((resolvePromise) => {
    const child = spawn(python, [WORKER_PATH], {
      cwd: PROJECT_DIR,
      windowsHide: true,
      shell: python === "py",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    let stderrLineBuffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolvePromise({ ok: false, error: `Python 推理超时（${Math.round(timeoutMs / 1000)}s）` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      stderrLineBuffer += text;
      let newlineIndex = stderrLineBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stderrLineBuffer.slice(0, newlineIndex).trim();
        stderrLineBuffer = stderrLineBuffer.slice(newlineIndex + 1);
        if (line.startsWith("LP_PROGRESS ") && onProgress) {
          try { onProgress(JSON.parse(line.slice("LP_PROGRESS ".length))); } catch { /* 忽略损坏的进度行 */ }
        }
        newlineIndex = stderrLineBuffer.indexOf("\n");
      }
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok: false, error: `无法启动 Python：${error.message}` });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolvePromise({ ok: false, error: `Python 进程无输出（退出码 ${code}）`, stderr });
        return;
      }
      try {
        const data = JSON.parse(trimmed);
        if (data.ok === true) resolvePromise({ ok: true, data });
        else resolvePromise({ ok: false, error: String(data.error ?? "Python 推理失败"), stderr });
      } catch {
        resolvePromise({ ok: false, error: `Python 输出不是有效 JSON：${trimmed.slice(0, 300)}`, stderr });
      }
    });
    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
  });
}

function walkModels(directory, base) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkModels(full, base));
    } else if (entry.isFile() && MODEL_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function handleModels() {
  if (!existsSync(MODELS_DIR)) {
    return { models: [], pythonOk: true, modelsDir: MODELS_DIR, hint: `模型文件夹不存在：${MODELS_DIR}。请在项目根目录创建 models 文件夹。` };
  }
  const files = walkModels(MODELS_DIR, MODELS_DIR).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return { models: [], pythonOk: true, modelsDir: MODELS_DIR, hint: "models 文件夹中没有发现模型文件（支持 .pth / .pt / .ckpt）。" };
  }
  const python = await runPython({ mode: "scan", files });
  const byPath = new Map();
  if (python.ok && Array.isArray(python.data?.results)) {
    for (const result of python.data.results) byPath.set(String(result.path), result);
  }
  const models = files.map((file) => {
    const info = byPath.get(file);
    const stats = statSync(file);
    return {
      name: relative(MODELS_DIR, file).split(sep).join("/"),
      size: stats.size,
      sizeLabel: formatBytes(stats.size),
      mtime: stats.mtimeMs,
      numModes: info?.numModes ?? null,
      backbone: info?.backbone ?? null,
      modeLabels: Array.isArray(info?.modeLabels) ? info.modeLabels : null,
      error: info?.ok === false ? String(info.error) : null,
    };
  });
  return { models, pythonOk: python.ok, pythonError: python.ok ? null : python.error, modelsDir: MODELS_DIR };
}

async function handlePredict(body) {
  const { modelName, near, far, size } = body ?? {};
  if (typeof modelName !== "string" || !Array.isArray(near) || !Array.isArray(far)) {
    return { error: "请求缺少 modelName / near / far 参数" };
  }
  const modelsRoot = resolve(MODELS_DIR);
  const modelPath = resolve(modelsRoot, modelName);
  if (modelPath !== modelsRoot && !modelPath.startsWith(modelsRoot + sep)) {
    return { error: "非法的模型路径" };
  }
  if (!existsSync(modelPath)) {
    return { error: `模型文件不存在：${modelName}（请确认已放入 models 文件夹）` };
  }
  const python = await runPython({ mode: "predict", modelPath, near, far, size: size ?? 224 });
  if (!python.ok) {
    return { error: python.error, stderr: python.stderr ?? null };
  }
  return { data: python.data };
}

function listFiberProfiles() {
  mkdirSync(FIBER_PROFILES_DIR, { recursive: true });
  const profiles = [];
  const errors = [];
  for (const entry of readdirSync(FIBER_PROFILES_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const fullPath = join(FIBER_PROFILES_DIR, entry.name);
    try {
      const profile = JSON.parse(readFileSync(fullPath, "utf8"));
      if (!profile || typeof profile !== "object" || !profile.id || !profile.fiber) {
        throw new Error("缺少 id 或 fiber 字段");
      }
      profiles.push(profile);
    } catch (error) {
      errors.push({ file: entry.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  profiles.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return { profiles, profilesDir: FIBER_PROFILES_DIR, errors };
}

function validateFiberProfileRequest(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const fiber = body?.fiber;
  const modes = body?.modes;
  if (!name) return "请输入组合名称";
  if (name.length > 80) return "组合名称不能超过 80 个字符";
  if (!fiber || ![fiber.coreRadius, fiber.na, fiber.wavelength, fiber.zoneSize].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) {
    return "光纤参数必须为正数";
  }
  if (!Array.isArray(modes) || modes.length === 0) return "当前参数没有检测到可保存的模式";
  return null;
}

async function saveFiberProfile(body, onProgress) {
  const validationError = validateFiberProfileRequest(body);
  if (validationError) return { error: validationError };

  const calibrationJob = {
    mode: "calibrate",
    fiber: body.fiber,
    modes: body.modes,
    calibration: {
      samples: 50,
      percentile: 95,
      safety: 1.10,
      seed: Number(body.calibration?.seed ?? 20260713),
      energyFraction: Number(body.calibration?.energyFraction ?? 0.95),
      paddingFactor: Number(body.calibration?.paddingFactor ?? 1.12),
      gridSize: Number(body.calibration?.gridSize ?? 600),
      fftRatio: Number(body.calibration?.fftRatio ?? 4),
    },
  };
  const python = await runPython(calibrationJob, 900000, onProgress);
  if (!python.ok) return { error: python.error, stderr: python.stderr ?? null };

  const id = `fiber-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const modeLabels = body.modes.map((mode) => String(mode.id));
  const familyCount = new Set(body.modes.map((mode) => `${mode.l}:${mode.m}`)).size;
  const calibration = { ...python.data };
  delete calibration.ok;
  const profile = {
    schemaVersion: 1,
    id,
    name: body.name.trim(),
    createdAt,
    fiber: body.fiber,
    vNumber: Number(body.vNumber),
    modeCount: body.modes.length,
    familyCount,
    modeLabels,
    modes: body.modes,
    display: {
      cropMode: "fixed",
      autoCrop: true,
      nearfieldCropRatio: calibration.nearfieldCropRatio,
      farfieldCropRatio: calibration.farfieldCropRatio,
      energyFraction: calibration.energyFraction,
      paddingFactor: calibration.paddingFactor,
      gamma: Number(body.calibration?.gamma ?? 0.7),
      gridSize: calibration.gridSize,
      fftRatio: calibration.fftRatio,
      outputSize: Number(body.calibration?.outputSize ?? 224),
    },
    calibration,
  };

  mkdirSync(FIBER_PROFILES_DIR, { recursive: true });
  const target = join(FIBER_PROFILES_DIR, `${id}.json`);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
  return { profile, profilesDir: FIBER_PROFILES_DIR };
}

const fiberProfileJobs = new Map();

function publicFiberProfileJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    completedSamples: job.completedSamples,
    totalSamples: job.totalSamples,
    elapsedMs: job.elapsedMs,
    estimatedRemainingMs: job.estimatedRemainingMs,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result ?? null,
    error: job.error ?? null,
  };
}

function startFiberProfileJob(body) {
  const validationError = validateFiberProfileRequest(body);
  if (validationError) return { error: validationError };
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    status: "running",
    stage: "queued",
    progress: 0,
    message: "校准任务已创建",
    completedSamples: 0,
    totalSamples: 50,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    createdAt: now,
    updatedAt: now,
  };
  fiberProfileJobs.set(job.id, job);

  void saveFiberProfile(body, (progress) => {
    if (job.status !== "running") return;
    job.stage = String(progress.stage ?? job.stage);
    job.progress = Number(progress.progress ?? job.progress);
    job.message = String(progress.message ?? job.message);
    job.completedSamples = Number(progress.completedSamples ?? job.completedSamples);
    job.totalSamples = Number(progress.totalSamples ?? job.totalSamples);
    job.elapsedMs = Number(progress.elapsedMs ?? job.elapsedMs);
    job.estimatedRemainingMs = progress.estimatedRemainingMs == null ? null : Number(progress.estimatedRemainingMs);
    job.updatedAt = new Date().toISOString();
  }).then((result) => {
    if (result.error) {
      job.status = "error";
      job.error = result.error;
      job.message = "校准失败";
    } else {
      job.status = "complete";
      job.stage = "complete";
      job.progress = 100;
      job.completedSamples = 50;
      job.estimatedRemainingMs = 0;
      job.message = "50 组光斑校准完成，组合已保存";
      job.result = result;
    }
    job.updatedAt = new Date().toISOString();
  }).catch((error) => {
    job.status = "error";
    job.message = "校准失败";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = new Date().toISOString();
  }).finally(() => {
    const timer = setTimeout(() => fiberProfileJobs.delete(job.id), 30 * 60 * 1000);
    timer.unref?.();
  });

  return { job: publicFiberProfileJob(job) };
}

function getFiberProfileJob(jobId) {
  const job = fiberProfileJobs.get(jobId);
  return job ? { job: publicFiberProfileJob(job) } : { error: "校准任务不存在或已过期" };
}

function readJsonBody(request) {
  return new Promise((resolvePromise, reject) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk.toString("utf8"); });
    request.on("end", () => {
      try {
        resolvePromise(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("请求体不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

async function respond(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    // workerd 沙箱的 fetch 对 keep-alive 连接复用有兼容问题，逐次关闭连接更可靠
    "Connection": "close",
  });
  response.end(JSON.stringify(payload));
}

function start(port) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        return await respond(response, 200, { ok: true });
      }
      if (request.method === "GET" && url.pathname === "/api/models") {
        return await respond(response, 200, await handleModels());
      }
      if (request.method === "POST" && url.pathname === "/api/predict") {
        const body = await readJsonBody(request);
        const result = await handlePredict(body);
        if (result.error) return await respond(response, 400, result);
        return await respond(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/api/fiber-profiles") {
        return await respond(response, 200, listFiberProfiles());
      }
      if (request.method === "POST" && url.pathname === "/api/fiber-profiles") {
        const body = await readJsonBody(request);
        const result = startFiberProfileJob(body);
        if (result.error) return await respond(response, 400, result);
        return await respond(response, 202, result);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/fiber-profile-jobs/")) {
        const jobId = decodeURIComponent(url.pathname.slice("/api/fiber-profile-jobs/".length));
        const result = getFiberProfileJob(jobId);
        if (result.error) return await respond(response, 404, result);
        return await respond(response, 200, result);
      }
      return await respond(response, 404, { error: "未找到接口" });
    } catch (error) {
      return await respond(response, 500, { error: error instanceof Error ? error.message : "预测服务内部错误" });
    }
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`预测端口 ${port} 被占用。请重新运行 启动后端.bat，启动器会自动清理本项目遗留进程。`);
      process.exit(1);
    }
    console.error("预测旁路服务启动失败：", error.message);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`预测旁路服务已就绪：http://127.0.0.1:${port}`);
  });
}

const port = Number(process.env.LP_PREDICT_PORT || 3099);
start(port);
