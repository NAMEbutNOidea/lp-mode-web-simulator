import { synthesizeSpot, type DisplaySettings, type FiberParams, type ModeSetting } from "../../lpPhysics";

function bytesToBase64(bytes: Uint8ClampedArray) {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function POST(request: Request) {
  try {
    const { fiber, modes, display } = await request.json() as { fiber: FiberParams; modes: ModeSetting[]; display: DisplaySettings };
    if (!fiber || !Array.isArray(modes) || !modes.some((mode) => mode.enabled && mode.weight !== 0)) {
      return Response.json({ error: "至少需要一个已启用且权重非零的模式" }, { status: 400 });
    }
    const safeDisplay: DisplaySettings = {
      autoCrop: display?.autoCrop ?? true,
      energyFraction: Math.max(0.5, Math.min(0.999, display?.energyFraction ?? 0.95)),
      paddingFactor: Math.max(1, Math.min(2, display?.paddingFactor ?? 1.12)),
      gamma: Math.max(0.1, Math.min(2, display?.gamma ?? 0.7)),
      gridSize: Math.max(128, Math.min(600, Math.round(display?.gridSize ?? 600))),
      outputSize: Math.max(64, Math.min(320, Math.round(display?.outputSize ?? 224))),
    };
    const result = synthesizeSpot(fiber, modes, safeDisplay);
    return Response.json({ rgbaBase64: bytesToBase64(result.pixels), farRgbaBase64: bytesToBase64(result.farPixels), peak: result.peak, totalPower: result.totalPower, crop: result.crop, farCrop: result.farCrop });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "光斑仿真失败" }, { status: 500 });
  }
}
