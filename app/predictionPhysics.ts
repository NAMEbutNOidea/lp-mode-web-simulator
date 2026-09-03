import type { DisplaySettings, FiberParams, ModeSetting } from "./lpPhysics";
import {
  extractSquareField,
  renderFarField,
  renderNearField,
  synthesizeField,
  type ComplexField,
} from "./lpPhysics";

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

export type AnalysisImages = {
  size: number;
  nearTrue: Uint8ClampedArray;
  nearPred: Uint8ClampedArray;
  nearResidual: Uint8ClampedArray;
  farTrue: Uint8ClampedArray;
  farPred: Uint8ClampedArray;
  farResidual: Uint8ClampedArray;
  phaseTrue: Float32Array;
  phasePred: Float32Array;
  phaseMask: Uint8ClampedArray;
};

export type PredictionAnalysis = {
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
  images: AnalysisImages;
  trueNorm: number;
  predNorm: number;
};

export function wrapPhase(value: number) {
  let wrapped = (value + Math.PI) % (2 * Math.PI);
  if (wrapped < 0) wrapped += 2 * Math.PI;
  return wrapped - Math.PI;
}

export function normalizeL2(weights: number[]) {
  const norm = Math.sqrt(weights.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0 || !Number.isFinite(norm)) return weights.map(() => 0);
  return weights.map((value) => value / norm);
}

export function pearson(imageA: Uint8ClampedArray, imageB: Uint8ClampedArray) {
  let sumA = 0;
  let sumB = 0;
  const length = imageA.length;
  for (let i = 0; i < length; i += 1) {
    sumA += imageA[i];
    sumB += imageB[i];
  }
  const meanA = sumA / length;
  const meanB = sumB / length;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const a = imageA[i] - meanA;
    const b = imageB[i] - meanB;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denominator = Math.sqrt(normA * normB);
  if (denominator <= 1e-12) return 0;
  return dot / denominator;
}

function gaussianWindow(size: number, sigma: number) {
  const half = Math.floor(size / 2);
  const window: number[] = [];
  let sum = 0;
  for (let y = -half; y <= half; y += 1) {
    for (let x = -half; x <= half; x += 1) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      window.push(value);
      sum += value;
    }
  }
  for (let i = 0; i < window.length; i += 1) window[i] /= sum;
  return window;
}

function symmetricPad(source: Uint8ClampedArray, size: number, padding: number) {
  const paddedSize = size + padding * 2;
  const output = new Float64Array(paddedSize * paddedSize);
  for (let y = 0; y < paddedSize; y += 1) {
    const sourceY = Math.abs(y - padding);
    const rowY = sourceY >= size ? 2 * size - 2 - sourceY : sourceY;
    for (let x = 0; x < paddedSize; x += 1) {
      const sourceX = Math.abs(x - padding);
      const rowX = sourceX >= size ? 2 * size - 2 - sourceX : sourceX;
      output[y * paddedSize + x] = source[rowY * size + rowX];
    }
  }
  return output;
}

export function ssim(imageA: Uint8ClampedArray, imageB: Uint8ClampedArray, size: number) {
  const windowSize = 11;
  const half = Math.floor(windowSize / 2);
  const window = gaussianWindow(windowSize, 1.5);
  const paddedA = symmetricPad(imageA, size, half);
  const paddedB = symmetricPad(imageB, size, half);
  const paddedSize = size + half * 2;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const muA = new Float64Array(size * size);
  const muB = new Float64Array(size * size);
  const sigma2A = new Float64Array(size * size);
  const sigma2B = new Float64Array(size * size);
  const sigmaAB = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sumA = 0;
      let sumB = 0;
      let sumA2 = 0;
      let sumB2 = 0;
      let sumAB = 0;
      let windowIndex = 0;
      for (let wy = -half; wy <= half; wy += 1) {
        for (let wx = -half; wx <= half; wx += 1) {
          const weight = window[windowIndex];
          const a = paddedA[(y + half + wy) * paddedSize + (x + half + wx)];
          const b = paddedB[(y + half + wy) * paddedSize + (x + half + wx)];
          sumA += weight * a;
          sumB += weight * b;
          sumA2 += weight * a * a;
          sumB2 += weight * b * b;
          sumAB += weight * a * b;
          windowIndex += 1;
        }
      }
      const index = y * size + x;
      muA[index] = sumA;
      muB[index] = sumB;
      sigma2A[index] = Math.max(0, sumA2 - sumA * sumA);
      sigma2B[index] = Math.max(0, sumB2 - sumB * sumB);
      sigmaAB[index] = sumAB - sumA * sumB;
    }
  }
  let total = 0;
  let count = 0;
  for (let i = 0; i < size * size; i += 1) {
    const numerator = (2 * muA[i] * muB[i] + c1) * (2 * sigmaAB[i] + c2);
    const denominator = (muA[i] * muA[i] + muB[i] * muB[i] + c1) * (sigma2A[i] + sigma2B[i] + c2);
    total += numerator / denominator;
    count += 1;
  }
  return count ? total / count : 1;
}

function residualFromGray(trueGray: Uint8ClampedArray, predGray: Uint8ClampedArray) {
  const residual = new Uint8ClampedArray(trueGray.length);
  for (let i = 0; i < trueGray.length; i += 1) {
    residual[i] = Math.round(Math.abs(trueGray[i] - predGray[i]) / 255 * 255);
  }
  return residual;
}

function cropComplexField(field: ComplexField, centerX: number, centerY: number, halfSize: number) {
  const cropSize = halfSize * 2;
  const real = extractSquareField(field.real, field.size, centerX, centerY, halfSize);
  const imag = extractSquareField(field.imag, field.size, centerX, centerY, halfSize);
  const intensity = new Float64Array(cropSize * cropSize);
  for (let i = 0; i < cropSize * cropSize; i += 1) {
    intensity[i] = real[i] * real[i] + imag[i] * imag[i];
  }
  return { real, imag, intensity, size: cropSize };
}

function nearestResize(source: Float32Array, sourceSize: number, outputSize: number) {
  if (sourceSize === outputSize) return source;
  const output = new Float32Array(outputSize * outputSize);
  for (let oy = 0; oy < outputSize; oy += 1) {
    const sy = Math.min(sourceSize - 1, Math.round((oy + 0.5) * (sourceSize / outputSize) - 0.5));
    for (let ox = 0; ox < outputSize; ox += 1) {
      const sx = Math.min(sourceSize - 1, Math.round((ox + 0.5) * (sourceSize / outputSize) - 0.5));
      output[oy * outputSize + ox] = source[sy * sourceSize + sx];
    }
  }
  return output;
}

function nearestResizeMask(source: Uint8ClampedArray, sourceSize: number, outputSize: number) {
  if (sourceSize === outputSize) return source;
  const output = new Uint8ClampedArray(outputSize * outputSize);
  for (let oy = 0; oy < outputSize; oy += 1) {
    const sy = Math.min(sourceSize - 1, Math.round((oy + 0.5) * (sourceSize / outputSize) - 0.5));
    for (let ox = 0; ox < outputSize; ox += 1) {
      const sx = Math.min(sourceSize - 1, Math.round((ox + 0.5) * (sourceSize / outputSize) - 0.5));
      output[oy * outputSize + ox] = source[sy * sourceSize + sx];
    }
  }
  return output;
}

function normalizeIntensity(intensity: Float64Array) {
  let minimum = Number.POSITIVE_INFINITY;
  let peak = 0;
  for (const value of intensity) if (value < minimum) minimum = value;
  for (const value of intensity) {
    const shifted = value - minimum;
    if (shifted > peak) peak = shifted;
  }
  const output = new Float64Array(intensity.length);
  if (peak > 0) {
    for (let i = 0; i < intensity.length; i += 1) output[i] = (intensity[i] - minimum) / peak;
  }
  return output;
}

function buildPhaseImages(trueField: ComplexField, predField: ComplexField, crop: { centroidX: number; centroidY: number; halfSize: number }, outputSize: number) {
  const trueCrop = cropComplexField(trueField, crop.centroidX, crop.centroidY, crop.halfSize);
  const predCrop = cropComplexField(predField, crop.centroidX, crop.centroidY, crop.halfSize);
  const truePhase = new Float32Array(trueCrop.size * trueCrop.size);
  const predPhase = new Float32Array(predCrop.size * predCrop.size);
  for (let i = 0; i < trueCrop.size * trueCrop.size; i += 1) {
    truePhase[i] = wrapPhase(Math.atan2(trueCrop.imag[i], trueCrop.real[i]));
    predPhase[i] = wrapPhase(Math.atan2(predCrop.imag[i], predCrop.real[i]));
  }
  const trueIntensity = normalizeIntensity(trueCrop.intensity);
  const predIntensity = normalizeIntensity(predCrop.intensity);
  const mask = new Uint8ClampedArray(trueCrop.size * trueCrop.size);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = Math.max(trueIntensity[i], predIntensity[i]) >= 0.01 ? 255 : 0;
  }
  return {
    phaseTrue: nearestResize(truePhase, trueCrop.size, outputSize),
    phasePred: nearestResize(predPhase, predCrop.size, outputSize),
    phaseMask: nearestResizeMask(mask, trueCrop.size, outputSize),
  };
}

export function analyzePrediction(params: FiberParams, modes: ModeSetting[], display: DisplaySettings, predWeights: number[], predPhases: number[]): PredictionAnalysis {
  const active = modes.filter((mode) => mode.enabled && mode.weight !== 0);
  const gridSize = display.gridSize;
  const size = 224;
  const modelDisplay: DisplaySettings = { ...display, outputSize: 224 };

  const trueWeights = normalizeL2(active.map((mode) => mode.weight));
  const trueRelativePhases = active.map((mode) => wrapPhase(mode.phase - active[0].phase));
  const trueSettings = active.map((mode, index) => ({
    ...mode,
    weight: trueWeights[index],
    phase: trueRelativePhases[index],
  }));
  const normalizedPredWeights = normalizeL2(predWeights);
  const predSettings = active.map((mode, index) => ({
    ...mode,
    enabled: true,
    weight: normalizedPredWeights[index] ?? 0,
    phase: predPhases[index] ?? 0,
  }));

  const trueField = synthesizeField(params, trueSettings, gridSize);
  const predField = synthesizeField(params, predSettings, gridSize);

  const nearTrueRender = renderNearField(trueField, params, modelDisplay);
  const nearPredRender = renderNearField(predField, params, modelDisplay);
  const farTrueRender = renderFarField(trueField, modelDisplay);
  const farPredRender = renderFarField(predField, modelDisplay);

  const nearTrueGray = nearTrueRender.grayPixels;
  const nearPredGray = nearPredRender.grayPixels;
  const farTrueGray = farTrueRender.grayPixels;
  const farPredGray = farPredRender.grayPixels;

  const nearPearson = pearson(nearTrueGray, nearPredGray);
  const farPearson = pearson(farTrueGray, farPredGray);
  const nearSsim = ssim(nearTrueGray, nearPredGray, 224);
  const farSsim = ssim(farTrueGray, farPredGray, 224);

  const weightMse = normalizedPredWeights.reduce((sum, value, index) => {
    const error = value - (trueSettings[index]?.weight ?? 0);
    return sum + error * error;
  }, 0) / Math.max(1, normalizedPredWeights.length);

  const phaseErrors = predPhases.map((value, index) => wrapPhase(value - trueRelativePhases[index]));
  const phaseMae = phaseErrors.slice(1).reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, phaseErrors.length - 1);

  let meanAbsResidualNear = 0;
  for (let i = 0; i < nearTrueGray.length; i += 1) meanAbsResidualNear += Math.abs(nearTrueGray[i] - nearPredGray[i]);
  meanAbsResidualNear /= 255 * nearTrueGray.length;
  let meanAbsResidualFar = 0;
  for (let i = 0; i < farTrueGray.length; i += 1) meanAbsResidualFar += Math.abs(farTrueGray[i] - farPredGray[i]);
  meanAbsResidualFar /= 255 * farTrueGray.length;

  const phaseImages = buildPhaseImages(trueField, predField, nearTrueRender.crop, size);

  const coefficients = active.map((mode, index) => ({
    label: `LP${mode.l}${mode.m}${mode.l === 0 ? "" : mode.parity}`,
    trueWeight: trueSettings[index].weight,
    predWeight: normalizedPredWeights[index] ?? 0,
    truePhase: trueRelativePhases[index],
    predPhase: predPhases[index] ?? 0,
  }));

  const rows: ErrorRow[] = coefficients.map((coefficient, index) => {
    const weightAbsError = Math.abs(coefficient.predWeight - coefficient.trueWeight);
    const weightRelErrorPercent = Math.abs(coefficient.trueWeight) > 1e-12 ? (weightAbsError / Math.abs(coefficient.trueWeight)) * 100 : 0;
    return {
      label: coefficient.label,
      trueWeight: coefficient.trueWeight,
      predWeight: coefficient.predWeight,
      weightAbsError,
      weightRelErrorPercent,
      truePhase: coefficient.truePhase,
      predPhase: coefficient.predPhase,
      phaseError: phaseErrors[index],
    };
  });

  const trueNorm = Math.sqrt(trueSettings.reduce((sum, mode) => sum + mode.weight * mode.weight, 0));
  const predNorm = Math.sqrt(normalizedPredWeights.reduce((sum, value) => sum + value * value, 0));

  return {
    coefficients,
    rows,
    metrics: {
      nearPearson,
      nearSsim,
      farPearson,
      farSsim,
      weightMse,
      phaseMae,
      meanAbsResidualNear,
      meanAbsResidualFar,
    },
    images: {
      size,
      nearTrue: nearTrueGray,
      nearPred: nearPredGray,
      nearResidual: residualFromGray(nearTrueGray, nearPredGray),
      farTrue: farTrueGray,
      farPred: farPredGray,
      farResidual: residualFromGray(farTrueGray, farPredGray),
      phaseTrue: phaseImages.phaseTrue,
      phasePred: phaseImages.phasePred,
      phaseMask: phaseImages.phaseMask,
    },
    trueNorm,
    predNorm,
  };
}
