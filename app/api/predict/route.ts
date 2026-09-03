import type { DisplaySettings, FiberParams, ModeSetting } from "../../lpPhysics";
import { renderFarField, renderNearField, synthesizeField } from "../../lpPhysics";
import { analyzePrediction, normalizeL2 } from "../../predictionPhysics";
import { BridgeError, sidecarPredict } from "../predictionBridge";

export const runtime = "nodejs";

function clampDisplay(display: Partial<DisplaySettings> | undefined): DisplaySettings {
  return {
    autoCrop: display?.autoCrop ?? true,
    cropMode: display?.cropMode === "fixed" ? "fixed" : "adaptive",
    nearfieldCropRatio: Number.isFinite(display?.nearfieldCropRatio) ? Math.max(0.001, Math.min(0.5, Number(display?.nearfieldCropRatio))) : null,
    farfieldCropRatio: Number.isFinite(display?.farfieldCropRatio) ? Math.max(0.001, Math.min(0.5, Number(display?.farfieldCropRatio))) : null,
    energyFraction: Math.max(0.5, Math.min(0.999, display?.energyFraction ?? 0.95)),
    paddingFactor: Math.max(1, Math.min(2, display?.paddingFactor ?? 1.12)),
    gamma: Math.max(0.1, Math.min(2, display?.gamma ?? 0.7)),
    gridSize: Math.max(128, Math.min(600, Math.round(display?.gridSize ?? 600))),
    fftRatio: Math.max(1, Math.min(4, Math.round(display?.fftRatio ?? 4))),
    outputSize: Math.max(64, Math.min(320, Math.round(display?.outputSize ?? 224))),
  };
}

function modeLabel(mode: ModeSetting) {
  return `LP${mode.l}${mode.m}${mode.l === 0 ? "" : mode.parity}`;
}

function alignPredictions(modeLabels: string[], activeIds: string[], weights: number[], phases: number[]) {
  const isGeneric = modeLabels.every((label) => /^mode_\d+$/.test(label));
  if (isGeneric || modeLabels.length !== activeIds.length) {
    return { weights, phases };
  }
  const indexByLabel = new Map<string, number>();
  modeLabels.forEach((label, index) => indexByLabel.set(label.toLowerCase(), index));
  const order: number[] = [];
  let aligned = true;
  for (const id of activeIds) {
    const index = indexByLabel.get(id.toLowerCase());
    if (index === undefined) {
      aligned = false;
      break;
    }
    order.push(index);
  }
  if (!aligned) return { weights, phases };
  return {
    weights: order.map((index) => weights[index]),
    phases: order.map((index) => phases[index]),
  };
}

function base64FromBytes(bytes: Uint8Array | Uint8ClampedArray) {
  return Buffer.from(bytes as Uint8Array).toString("base64");
}

function base64FromFloats(values: Float32Array) {
  const buffer = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i += 1) buffer.writeFloatLE(values[i], i * 4);
  return buffer.toString("base64");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      fiber?: FiberParams;
      modes?: ModeSetting[];
      display?: Partial<DisplaySettings>;
      model?: string;
    };
    const { fiber, modes, model } = body;
    if (!fiber || !Array.isArray(modes) || typeof model !== "string" || !model.trim()) {
      return Response.json({ error: "请求缺少 fiber / modes / model 参数" }, { status: 400 });
    }
    const display = clampDisplay(body.display);
    const active = modes.filter((mode) => mode.enabled && mode.weight !== 0);
    if (!active.length) {
      return Response.json({ error: "至少需要一个已启用且权重非零的模式" }, { status: 400 });
    }

    const modelDisplay: DisplaySettings = { ...display, outputSize: 224 };
    const field = synthesizeField(fiber, active, display.gridSize);
    const nearRender = renderNearField(field, fiber, modelDisplay);
    const farRender = renderFarField(field, modelDisplay);
    const nearGray = nearRender.grayPixels;
    const farGray = farRender.grayPixels;

    const data = await sidecarPredict({
      modelName: model.trim(),
      near: Array.from(nearGray),
      far: Array.from(farGray),
      size: 224,
    });

    const numModes = Number(data.numModes);
    if (!Number.isInteger(numModes) || numModes < 2) {
      return Response.json({ error: `模型模式数解析失败（${String(data.numModes)}）` }, { status: 500 });
    }
    if (numModes !== active.length) {
      return Response.json({
        error: `模型要求 ${numModes} 个空间模式，但当前仿真启用了 ${active.length} 个。请调整光纤参数使检测模式数与模型一致（例如将模型所属数据集的光纤参数填入），或更换模型。`,
      }, { status: 400 });
    }

    const weights = Array.isArray(data.weights) ? (data.weights as number[]).map(Number) : [];
    const phases = Array.isArray(data.phases) ? (data.phases as number[]).map(Number) : [];
    const modeLabels = Array.isArray(data.modeLabels) ? (data.modeLabels as string[]) : [];
    if (weights.length !== numModes || phases.length !== numModes) {
      return Response.json({ error: "模型输出维度异常" }, { status: 500 });
    }
    const activeIds = active.map(modeLabel);
    const aligned = alignPredictions(modeLabels, activeIds, weights, phases);
    const normalizedPredWeights = normalizeL2(aligned.weights);
    const analysis = analyzePrediction(fiber, active, display, normalizedPredWeights, aligned.phases);

    return Response.json({
      model: {
        name: model.trim(),
        numModes,
        backbone: String(data.backbone ?? "unknown"),
        modeLabels,
        device: String(data.device ?? "cpu"),
        elapsedMs: Number(data.elapsedMs ?? 0),
      },
      modeCount: active.length,
      coefficients: analysis.coefficients,
      rows: analysis.rows,
      metrics: analysis.metrics,
      norm: { trueNorm: analysis.trueNorm, predNorm: analysis.predNorm },
      images: {
        size: analysis.images.size,
        nearTrue: base64FromBytes(analysis.images.nearTrue),
        nearPred: base64FromBytes(analysis.images.nearPred),
        nearResidual: base64FromBytes(analysis.images.nearResidual),
        farTrue: base64FromBytes(analysis.images.farTrue),
        farPred: base64FromBytes(analysis.images.farPred),
        farResidual: base64FromBytes(analysis.images.farResidual),
        phaseTrue: base64FromFloats(analysis.images.phaseTrue),
        phasePred: base64FromFloats(analysis.images.phasePred),
        phaseMask: base64FromBytes(analysis.images.phaseMask),
      },
    });
  } catch (error) {
    if (error instanceof BridgeError && error.status === 400) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({
      error: error instanceof Error ? error.message : "模态预测失败",
    }, { status: 500 });
  }
}
