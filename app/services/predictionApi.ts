import type { DisplaySettings, FiberParams, ModeSetting } from "../lpPhysics";

export type ModelInfo = {
  name: string;
  size: number;
  sizeLabel: string;
  mtime: number;
  numModes: number | null;
  backbone: string | null;
  modeLabels: string[] | null;
  error: string | null;
};

export type ModelsResponse = {
  models: ModelInfo[];
  pythonOk: boolean;
  pythonError: string | null;
  modelsDir: string;
  hint?: string;
};

export type CoefficientRow = {
  label: string;
  trueWeight: number;
  predWeight: number;
  truePhase: number;
  predPhase: number;
};

export type ErrorRow = {
  label: string;
  trueWeight: number;
  predWeight: number;
  weightAbsError: number;
  weightRelErrorPercent: number;
  truePhase: number;
  predPhase: number;
  phaseError: number;
};

export type PredictionPayload = {
  model: {
    name: string;
    numModes: number;
    backbone: string;
    modeLabels: string[];
    device: string;
    elapsedMs: number;
  };
  modeCount: number;
  coefficients: CoefficientRow[];
  rows: ErrorRow[];
  metrics: {
    nearPearson: number;
    nearSsim: number;
    farPearson: number;
    farSsim: number;
    weightMse: number;
    phaseMae: number;
    meanAbsResidualNear: number;
    meanAbsResidualFar: number;
  };
  norm: { trueNorm: number; predNorm: number };
  images: {
    size: number;
    nearTrue: string;
    nearPred: string;
    nearResidual: string;
    farTrue: string;
    farPred: string;
    farResidual: string;
    phaseTrue: string;
    phasePred: string;
    phaseMask: string;
  };
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "服务器处理失败");
  }
  return response.json() as Promise<T>;
}

export async function requestModels() {
  const response = await fetch("/api/models");
  return parseResponse<ModelsResponse>(response);
}

export async function requestPrediction(fiber: FiberParams, modes: ModeSetting[], display: DisplaySettings, modelName: string) {
  const response = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fiber, modes, display, model: modelName }),
  });
  return parseResponse<PredictionPayload>(response);
}
