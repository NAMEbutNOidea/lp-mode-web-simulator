export type FiberParams = {
  coreRadius: number;
  na: number;
  wavelength: number;
  zoneSize: number;
  maxL: number;
  maxM: number;
};

export type LPMode = {
  id: string;
  l: number;
  m: number;
  parity: "e" | "o";
  u: number;
  w: number;
  cutoff: number;
};

export type ModeSetting = LPMode & {
  enabled: boolean;
  weight: number;
  phase: number;
};

export type SimulationResult = {
  pixels: Uint8ClampedArray;
  farPixels: Uint8ClampedArray;
  peak: number;
  totalPower: number;
  crop: CropInfo;
  farCrop: CropInfo;
};

export type DisplaySettings = {
  autoCrop: boolean;
  energyFraction: number;
  paddingFactor: number;
  gamma: number;
  gridSize: number;
  outputSize: number;
};

export type CropInfo = {
  cropRatio: number;
  energyRadius: number;
  halfSize: number;
  centroidX: number;
  centroidY: number;
  energyFraction: number;
  physicalWidth: number;
};

const zeroCache = new Map<string, number[]>();

function besselJ0(x: number) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const p = 57568490574 + y * (-13362590354 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const q = 57568490411 + y * (1029532985 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return p / q;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 0.785398164;
  const p = 1 + y * (-0.001098628627 + y * (0.00002734510407 + y * (-0.000002073370639 + y * 0.0000002093887211)));
  const q = -0.01562499995 + y * (0.0001430488765 + y * (-0.000006911147651 + y * (0.0000007621095161 - y * 0.0000000934945152)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

function besselJ1(x: number) {
  const ax = Math.abs(x);
  let result: number;
  if (ax < 8) {
    const y = x * x;
    const p = x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const q = 144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    result = p / q;
  } else {
    const z = 8 / ax;
    const y = z * z;
    const xx = ax - 2.356194491;
    const p = 1 + y * (0.00183105 + y * (-0.00003516396496 + y * (0.000002457520174 + y * -0.000000240337019)));
    const q = 0.04687499995 + y * (-0.0002002690873 + y * (0.000008449199096 + y * (-0.00000088228987 + y * 0.000000105787412)));
    result = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
    if (x < 0) result = -result;
  }
  return result;
}

export function besselJ(order: number, x: number) {
  if (order === 0) return besselJ0(x);
  if (order === 1) return besselJ1(x);
  if (x === 0) return 0;
  if (Math.abs(x) < order + 1) {
    let term = Math.pow(x / 2, order);
    for (let i = 2; i <= order; i += 1) term /= i;
    let sum = term;
    for (let k = 1; k < 80; k += 1) {
      term *= -(x * x / 4) / (k * (order + k));
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return sum;
  }
  let jm = besselJ0(x);
  let j = besselJ1(x);
  for (let n = 1; n < order; n += 1) {
    const jp = (2 * n * j) / x - jm;
    jm = j;
    j = jp;
  }
  return j;
}

function besselI0(x: number) {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return 1 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
  }
  const y = 3.75 / ax;
  return (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
}

function besselI1(x: number) {
  const ax = Math.abs(x);
  let result: number;
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    result = ax * (0.5 + y * (0.87890594 + y * (0.51498869 + y * (0.15084934 + y * (0.02658733 + y * (0.00301532 + y * 0.00032411))))));
  } else {
    const y = 3.75 / ax;
    result = (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (-0.03988024 + y * (-0.00362018 + y * (0.00163801 + y * (-0.01031555 + y * (0.02282967 + y * (-0.02895312 + y * (0.01787654 - y * 0.00420059))))))));
  }
  return x < 0 ? -result : result;
}

function besselK0(x: number) {
  if (x <= 0) return Number.POSITIVE_INFINITY;
  if (x <= 2) {
    const y = (x * x) / 4;
    return -Math.log(x / 2) * besselI0(x) + (-0.57721566 + y * (0.4227842 + y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (-0.07832358 + y * (0.02189568 + y * (-0.01062446 + y * (0.00587872 + y * (-0.0025154 + y * 0.00053208))))));
}

function besselK1(x: number) {
  if (x <= 0) return Number.POSITIVE_INFINITY;
  if (x <= 2) {
    const y = (x * x) / 4;
    return Math.log(x / 2) * besselI1(x) + (1 / x) * (1 + y * (0.15443144 + y * (-0.67278579 + y * (-0.18156897 + y * (-0.01919402 + y * (-0.00110404 + y * -0.00004686))))));
  }
  const y = 2 / x;
  return (Math.exp(-x) / Math.sqrt(x)) * (1.25331414 + y * (0.23498619 + y * (-0.0365562 + y * (0.01504268 + y * (-0.00780353 + y * (0.00325614 + y * -0.00068245))))));
}

function besselK(order: number, x: number) {
  if (order === 0) return besselK0(x);
  if (order === 1) return besselK1(x);
  let km = besselK0(x);
  let k = besselK1(x);
  for (let n = 1; n < order; n += 1) {
    const kp = km + (2 * n * k) / x;
    km = k;
    k = kp;
  }
  return k;
}

function bisection(fn: (x: number) => number, left: number, right: number) {
  let fl = fn(left);
  for (let i = 0; i < 72; i += 1) {
    const mid = (left + right) / 2;
    const fm = fn(mid);
    if (!Number.isFinite(fm)) {
      left = mid;
      fl = fn(left);
      continue;
    }
    if (fl * fm <= 0) right = mid;
    else {
      left = mid;
      fl = fm;
    }
  }
  return (left + right) / 2;
}

function besselZeros(order: number, count: number) {
  const key = `${order}:${count}`;
  const cached = zeroCache.get(key);
  if (cached) return cached;
  const roots: number[] = [];
  let x0 = 0.0001;
  let y0 = besselJ(order, x0);
  const limit = Math.max(30, (count + order / 2 + 2) * Math.PI);
  for (let x = 0.025; x <= limit && roots.length < count; x += 0.025) {
    const y = besselJ(order, x);
    if (Number.isFinite(y) && y0 * y < 0) roots.push(bisection((v) => besselJ(order, v), x0, x));
    x0 = x;
    y0 = y;
  }
  zeroCache.set(key, roots);
  return roots;
}

function characteristic(u: number, l: number, v: number) {
  if (u <= 0 || u >= v) return Number.NaN;
  const w = Math.sqrt(v * v - u * u);
  const jl = besselJ(l, u);
  const kl = besselK(l, w);
  if (Math.abs(jl) < 1e-12 || !Number.isFinite(kl) || Math.abs(kl) < 1e-300) return Number.NaN;
  return (u * besselJ(l + 1, u)) / jl - (w * besselK(l + 1, w)) / kl;
}

function findCharacteristicRoot(l: number, lower: number, upper: number, v: number) {
  const start = Math.max(lower + 1e-6, 1e-6);
  const end = Math.min(upper - 1e-6, v - 1e-6);
  if (start >= end) return Number.NaN;
  const steps = 240;
  let x0 = start;
  let y0 = characteristic(x0, l, v);
  for (let i = 1; i <= steps; i += 1) {
    const x = start + ((end - start) * i) / steps;
    const y = characteristic(x, l, v);
    if (Number.isFinite(y0) && Number.isFinite(y) && y0 * y < 0) {
      return bisection((q) => characteristic(q, l, v), x0, x);
    }
    x0 = x;
    y0 = y;
  }
  return Number.NaN;
}

export function calculateV(params: FiberParams) {
  return (2 * Math.PI * params.coreRadius * params.na) / params.wavelength;
}

export function discoverSupportedModes(params: FiberParams) {
  const v = calculateV(params);
  // MATLAB solve_besselj.m reserves the first entry as u=0 for l>=1.
  // Keeping that convention is essential for the LP01/LP11 cutoff intervals.
  const roots = Array.from({ length: params.maxL + 1 }, (_, l) =>
    l === 0 ? besselZeros(0, params.maxM + 1) : [0, ...besselZeros(l, params.maxM)],
  );
  const modes: LPMode[] = [];
  for (let l = 0; l < params.maxL; l += 1) {
    for (let m = 1; m <= params.maxM; m += 1) {
      let lower: number;
      let upper: number;
      if (l === 0) {
        upper = roots[0][m - 1];
        lower = roots[1][m - 1];
      } else if (l === 1) {
        upper = roots[1][m];
        lower = roots[0][m - 1];
      } else {
        upper = roots[l][m];
        lower = roots[l - 1][m];
      }
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= v) continue;
      const u = findCharacteristicRoot(l, lower, upper, v);
      if (!Number.isFinite(u)) continue;
      const w = Math.sqrt(v * v - u * u);
      modes.push({ id: `LP${l}${m}e`, l, m, parity: "e", u, w, cutoff: lower });
      if (l !== 0) modes.push({ id: `LP${l}${m}o`, l, m, parity: "o", u, w, cutoff: lower });
    }
  }
  return modes;
}

function findEnergyCrop(intensity: Float64Array, size: number, energyFraction: number, paddingFactor: number) {
  let total = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = intensity[y * size + x];
      total += value;
      weightedX += x * value;
      weightedY += y * value;
    }
  }
  const centroidX = total > 0 ? Math.round(weightedX / total) : Math.floor(size / 2);
  const centroidY = total > 0 ? Math.round(weightedY / total) : Math.floor(size / 2);
  const maxDistanceSquared = 2 * (size - 1) * (size - 1);
  const radialEnergy = new Float64Array(maxDistanceSquared + 1);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - centroidX;
      const dy = y - centroidY;
      radialEnergy[dx * dx + dy * dy] += intensity[y * size + x];
    }
  }
  let cumulative = 0;
  let energyRadius = 1;
  const target = total * energyFraction;
  for (let distanceSquared = 0; distanceSquared < radialEnergy.length; distanceSquared += 1) {
    cumulative += radialEnergy[distanceSquared];
    if (cumulative >= target) { energyRadius = Math.max(1, Math.sqrt(distanceSquared)); break; }
  }
  const boundary = Math.min(centroidX, size - 1 - centroidX, centroidY, size - 1 - centroidY);
  const halfSize = Math.max(2, Math.min(boundary, Math.ceil(energyRadius * paddingFactor)));
  return { centroidX, centroidY, energyRadius, halfSize };
}

function extractSquare(source: Float64Array, sourceSize: number, centerX: number, centerY: number, halfSize: number) {
  const left = centerX - halfSize;
  const top = centerY - halfSize;
  const cropSize = halfSize * 2;
  const output = new Float64Array(cropSize * cropSize);
  for (let y = 0; y < cropSize; y += 1) {
    for (let x = 0; x < cropSize; x += 1) output[y * cropSize + x] = source[(top + y) * sourceSize + left + x];
  }
  return output;
}

function resizeGrayBilinear(source: Uint8ClampedArray, sourceSize: number, outputSize: number) {
  if (sourceSize === outputSize) return source;
  const output = new Uint8ClampedArray(outputSize * outputSize);
  const scale = outputSize / sourceSize;
  for (let oy = 0; oy < outputSize; oy += 1) {
    const sy = (oy + 0.5) / scale - 0.5;
    const rawY0 = Math.floor(sy);
    const y0 = Math.max(0, Math.min(sourceSize - 1, rawY0));
    const y1 = Math.max(0, Math.min(sourceSize - 1, rawY0 + 1));
    const fy = sy - rawY0;
    for (let ox = 0; ox < outputSize; ox += 1) {
      const sx = (ox + 0.5) / scale - 0.5;
      const rawX0 = Math.floor(sx);
      const x0 = Math.max(0, Math.min(sourceSize - 1, rawX0));
      const x1 = Math.max(0, Math.min(sourceSize - 1, rawX0 + 1));
      const fx = sx - rawX0;
      const topValue = source[y0 * sourceSize + x0] * (1 - fx) + source[y0 * sourceSize + x1] * fx;
      const bottomValue = source[y1 * sourceSize + x0] * (1 - fx) + source[y1 * sourceSize + x1] * fx;
      output[oy * outputSize + ox] = Math.round(topValue * (1 - fy) + bottomValue * fy);
    }
  }
  return output;
}

function cropAndRender(intensity: Float64Array, size: number, display: DisplaySettings, physicalSize: number) {
  const adaptive = display.autoCrop
    ? findEnergyCrop(intensity, size, display.energyFraction, display.paddingFactor)
    : { centroidX: Math.floor(size / 2), centroidY: Math.floor(size / 2), energyRadius: size / 2, halfSize: Math.floor(size / 2) };
  const cropRatio = Math.min(1, (adaptive.halfSize * 2) / size);
  const cropIntensity = extractSquare(intensity, size, adaptive.centroidX, adaptive.centroidY, adaptive.halfSize);
  let minimum = Number.POSITIVE_INFINITY;
  let peak = 0;
  for (const value of cropIntensity) if (value < minimum) minimum = value;
  for (const value of cropIntensity) {
    const shifted = value - minimum;
    if (shifted > peak) peak = shifted;
  }
  const cropGray = new Uint8ClampedArray(cropIntensity.length);
  for (let i = 0; i < cropIntensity.length; i += 1) {
    const value = peak > 0 ? Math.pow((cropIntensity[i] - minimum) / peak, display.gamma) : 0;
    cropGray[i] = Math.round(value * 255);
  }
  const outputGray = resizeGrayBilinear(cropGray, adaptive.halfSize * 2, display.outputSize);
  const pixels = new Uint8ClampedArray(display.outputSize * display.outputSize * 4);
  for (let i = 0; i < outputGray.length; i += 1) {
    const gray = outputGray[i];
    pixels[i * 4] = gray;
    pixels[i * 4 + 1] = gray;
    pixels[i * 4 + 2] = gray;
    pixels[i * 4 + 3] = 255;
  }
  return {
    pixels,
    peak,
    crop: {
      cropRatio,
      energyRadius: adaptive.energyRadius,
      halfSize: adaptive.halfSize,
      centroidX: adaptive.centroidX,
      centroidY: adaptive.centroidY,
      energyFraction: display.energyFraction,
      physicalWidth: physicalSize * cropRatio,
    },
  };
}

type FftPlan = { size: number; factors: number[]; twiddleReal: Float64Array; twiddleImag: Float64Array };

function createFftPlan(size: number): FftPlan {
  const factors: number[] = [];
  let remaining = size;
  let radix = 4;
  let floorSqrt = Math.floor(Math.sqrt(remaining));
  while (remaining > 1) {
    while (remaining % radix !== 0) {
      if (radix === 4) radix = 2;
      else if (radix === 2) radix = 3;
      else radix += 2;
      if (radix > floorSqrt) { radix = remaining; break; }
    }
    remaining /= radix;
    factors.push(radix, remaining);
    floorSqrt = Math.floor(Math.sqrt(remaining));
  }
  const twiddleReal = new Float64Array(size);
  const twiddleImag = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    const angle = (-2 * Math.PI * i) / size;
    twiddleReal[i] = Math.cos(angle);
    twiddleImag[i] = Math.sin(angle);
  }
  return { size, factors, twiddleReal, twiddleImag };
}

function fftWork(outputReal: Float64Array, outputImag: Float64Array, outputOffset: number, inputReal: Float64Array, inputImag: Float64Array, inputOffset: number, frequencyStride: number, inputStride: number, factorIndex: number, plan: FftPlan) {
  const radix = plan.factors[factorIndex];
  const subSize = plan.factors[factorIndex + 1];
  if (subSize === 1) {
    for (let i = 0; i < radix; i += 1) {
      const source = inputOffset + i * frequencyStride * inputStride;
      outputReal[outputOffset + i] = inputReal[source];
      outputImag[outputOffset + i] = inputImag[source];
    }
  } else {
    for (let i = 0; i < radix; i += 1) fftWork(outputReal, outputImag, outputOffset + i * subSize, inputReal, inputImag, inputOffset + i * frequencyStride * inputStride, frequencyStride * radix, inputStride, factorIndex + 2, plan);
  }
  const scratchReal = new Float64Array(radix);
  const scratchImag = new Float64Array(radix);
  for (let k = 0; k < subSize; k += 1) {
    for (let q = 0; q < radix; q += 1) {
      const source = outputOffset + k + q * subSize;
      const twiddle = (k * q * frequencyStride) % plan.size;
      const real = outputReal[source]; const imag = outputImag[source];
      scratchReal[q] = real * plan.twiddleReal[twiddle] - imag * plan.twiddleImag[twiddle];
      scratchImag[q] = real * plan.twiddleImag[twiddle] + imag * plan.twiddleReal[twiddle];
    }
    for (let outputIndex = 0; outputIndex < radix; outputIndex += 1) {
      let sumReal = 0; let sumImag = 0;
      for (let q = 0; q < radix; q += 1) {
        const angle = (-2 * Math.PI * q * outputIndex) / radix;
        const cos = Math.cos(angle); const sin = Math.sin(angle);
        sumReal += scratchReal[q] * cos - scratchImag[q] * sin;
        sumImag += scratchReal[q] * sin + scratchImag[q] * cos;
      }
      outputReal[outputOffset + k + outputIndex * subSize] = sumReal;
      outputImag[outputOffset + k + outputIndex * subSize] = sumImag;
    }
  }
}

function fft2Intensity(fieldReal: Float64Array, fieldImag: Float64Array, fieldSize: number, fftRatio: number) {
  const paddedSize = fieldSize * fftRatio;
  const paddedCount = paddedSize * paddedSize;
  const real = new Float64Array(paddedCount);
  const imag = new Float64Array(paddedCount);
  const padding = Math.floor((paddedSize - fieldSize) / 2);
  for (let y = 0; y < fieldSize; y += 1) {
    const windowY = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / Math.max(fieldSize - 1, 1));
    for (let x = 0; x < fieldSize; x += 1) {
      const windowX = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / Math.max(fieldSize - 1, 1));
      const target = (y + padding) * paddedSize + x + padding;
      const source = y * fieldSize + x;
      real[target] = fieldReal[source] * windowY * windowX;
      imag[target] = fieldImag[source] * windowY * windowX;
    }
  }
  const plan = createFftPlan(paddedSize);
  const lineReal = new Float64Array(paddedSize);
  const lineImag = new Float64Array(paddedSize);
  for (let y = 0; y < paddedSize; y += 1) {
    fftWork(lineReal, lineImag, 0, real, imag, y * paddedSize, 1, 1, 0, plan);
    real.set(lineReal, y * paddedSize); imag.set(lineImag, y * paddedSize);
  }
  for (let x = 0; x < paddedSize; x += 1) {
    fftWork(lineReal, lineImag, 0, real, imag, x, 1, paddedSize, 0, plan);
    for (let y = 0; y < paddedSize; y += 1) {
      const target = y * paddedSize + x;
      real[target] = lineReal[y]; imag[target] = lineImag[y];
    }
  }
  const intensity = new Float64Array(paddedCount);
  for (let y = 0; y < paddedSize; y += 1) {
    const shiftedY = (y + paddedSize / 2) % paddedSize;
    for (let x = 0; x < paddedSize; x += 1) {
      const shiftedX = (x + paddedSize / 2) % paddedSize;
      const source = y * paddedSize + x;
      intensity[shiftedY * paddedSize + shiftedX] = real[source] * real[source] + imag[source] * imag[source];
    }
  }
  return { intensity, size: paddedSize };
}

export function synthesizeSpot(params: FiberParams, settings: ModeSetting[], display: DisplaySettings): SimulationResult {
  const active = settings.filter((mode) => mode.enabled && mode.weight !== 0);
  const amplitudeNorm = Math.sqrt(active.reduce((sum, mode) => sum + mode.weight * mode.weight, 0)) || 1;
  const size = display.gridSize;
  const pixelCount = size * size;
  const real = new Float64Array(pixelCount);
  const imag = new Float64Array(pixelCount);
  const halfZone = params.zoneSize / 2;
  for (const mode of active) {
    const values = new Float64Array(pixelCount);
    let energy = 0;
    const boundaryK = besselK(mode.l, mode.w);
    const boundaryJ = besselJ(mode.l, mode.u);
    for (let py = 0; py < size; py += 1) {
      const y = halfZone - (py / (size - 1)) * params.zoneSize;
      for (let px = 0; px < size; px += 1) {
        const x = -halfZone + (px / (size - 1)) * params.zoneSize;
        const r = Math.sqrt(x * x + y * y);
        const phi = Math.atan2(y, x);
        const rho = r / params.coreRadius;
        let radial: number;
        if (rho <= 1) radial = besselJ(mode.l, mode.u * rho);
        else radial = (boundaryJ * besselK(mode.l, mode.w * rho)) / boundaryK;
        const angular = mode.parity === "e" ? Math.cos(mode.l * phi) : Math.sin(mode.l * phi);
        const value = Number.isFinite(radial) ? radial * angular : 0;
        const index = py * size + px;
        values[index] = value;
        energy += value * value;
      }
    }
    const norm = Math.sqrt(energy) || 1;
    const normalizedWeight = mode.weight / amplitudeNorm;
    const c = Math.cos(mode.phase) * normalizedWeight;
    const s = Math.sin(mode.phase) * normalizedWeight;
    for (let i = 0; i < pixelCount; i += 1) {
      const e = values[i] / norm;
      real[i] += c * e;
      imag[i] += s * e;
    }
  }

  const intensity = new Float64Array(pixelCount);
  let totalPower = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const value = real[i] * real[i] + imag[i] * imag[i];
    intensity[i] = value;
    totalPower += value;
  }

  const near = cropAndRender(intensity, size, display, params.zoneSize);
  const farfield = fft2Intensity(real, imag, size, 4);
  const far = cropAndRender(farfield.intensity, farfield.size, display, 1);
  return {
    pixels: near.pixels,
    farPixels: far.pixels,
    peak: near.peak,
    totalPower,
    crop: near.crop,
    farCrop: far.crop,
  };
}
