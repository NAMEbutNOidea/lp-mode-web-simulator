const PREDICTION_SERVER = process.env.LP_PREDICT_SERVER_URL || "http://127.0.0.1:3099";

export class BridgeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function relay<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PREDICTION_SERVER}${path}`, {
      ...init,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : init?.signal,
    });
  } catch (error) {
    throw new Error(`预测服务未连接（${PREDICTION_SERVER}）：请通过 启动后端.bat 或 node 后端.mjs 启动，预测旁路服务会随后端一并启动。${error instanceof Error ? `（${error.message}）` : ""}`);
  }
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok || payload?.error) {
    throw new BridgeError(payload?.error || `预测服务错误（HTTP ${response.status}）`, response.status);
  }
  return payload as T;
}

export async function sidecarModels() {
  return relay<{
    models: Array<{
      name: string;
      size: number;
      sizeLabel: string;
      mtime: number;
      numModes: number | null;
      backbone: string | null;
      modeLabels: string[] | null;
      error: string | null;
    }>;
    pythonOk: boolean;
    pythonError: string | null;
    modelsDir: string;
    hint?: string;
  }>("/api/models");
}

export async function sidecarPredict(payload: { modelName: string; near: number[]; far: number[]; size: number }) {
  const result = await relay<{ data: Record<string, unknown> }>("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 300000);
  return result.data;
}

export async function sidecarFiberProfiles() {
  return relay<{ profiles: unknown[]; profilesDir: string; errors: Array<{ file: string; error: string }> }>("/api/fiber-profiles");
}

export async function sidecarStartFiberProfileJob(payload: Record<string, unknown>) {
  return relay<{ job: Record<string, unknown> }>("/api/fiber-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 30000);
}

export async function sidecarFiberProfileJob(jobId: string) {
  return relay<{ job: Record<string, unknown> }>(`/api/fiber-profile-jobs/${encodeURIComponent(jobId)}`);
}
