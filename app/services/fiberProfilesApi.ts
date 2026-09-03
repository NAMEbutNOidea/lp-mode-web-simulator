import type { DisplaySettings, FiberParams, LPMode } from "../lpPhysics";

export type FiberCalibration = {
  samples: 50;
  percentile: number;
  safety: number;
  seed: number;
  randomEngine: string;
  weightRange: [number, number];
  phaseRange: [number, number];
  energyFraction: number;
  paddingFactor: number;
  gridSize: number;
  fftRatio: number;
  fftSize: number;
  nearSampleFullWidthRatios: number[];
  farSampleFullWidthRatios: number[];
  nearPercentileFullWidthRatio: number;
  farPercentileFullWidthRatio: number;
  nearfieldCropRatio: number;
  farfieldCropRatio: number;
  nearCropPixels: number;
  farCropPixels: number;
  nearViewMagnification: number;
  farViewMagnification: number;
  elapsedMs: number;
};

export type FiberProfile = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  fiber: FiberParams;
  vNumber: number;
  modeCount: number;
  familyCount: number;
  modeLabels: string[];
  modes: LPMode[];
  display: DisplaySettings;
  calibration: FiberCalibration;
};

export type FiberProfilesResponse = {
  profiles: FiberProfile[];
  profilesDir: string;
  errors: Array<{ file: string; error: string }>;
};

export type FiberProfileJob = {
  id: string;
  status: "running" | "complete" | "error";
  stage: "queued" | "preparing" | "basis" | "sampling" | "finalizing" | "complete";
  progress: number;
  message: string;
  completedSamples: number;
  totalSamples: number;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  createdAt: string;
  updatedAt: string;
  result: { profile: FiberProfile; profilesDir: string } | null;
  error: string | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ({ error?: string } & Partial<T>) | null;
  if (!response.ok || payload?.error) throw new Error(payload?.error || "自定义光纤组合处理失败");
  return payload as T;
}

export async function requestFiberProfiles() {
  return parseResponse<FiberProfilesResponse>(await fetch("/api/fiber-profiles"));
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function saveFiberProfile(name: string, fiber: FiberParams, display: DisplaySettings, onProgress?: (job: FiberProfileJob) => void) {
  const started = await parseResponse<{ job: FiberProfileJob }>(await fetch("/api/fiber-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, fiber, display }),
  }));
  let job = started.job;
  onProgress?.(job);
  while (job.status === "running") {
    await wait(700);
    const response = await parseResponse<{ job: FiberProfileJob }>(await fetch(`/api/fiber-profiles?job=${encodeURIComponent(job.id)}`, { cache: "no-store" }));
    job = response.job;
    onProgress?.(job);
  }
  if (job.status === "error") throw new Error(job.error || "裁剪校准失败");
  if (!job.result) throw new Error("校准完成但没有返回组合数据");
  return job.result;
}
