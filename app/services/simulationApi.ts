import type { CropInfo, DisplaySettings, FiberParams, LPMode, ModeSetting } from "../lpPhysics";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "服务器计算失败");
  }
  return response.json() as Promise<T>;
}

export async function requestSupportedModes(fiber: FiberParams) {
  const response = await fetch("/api/modes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fiber }) });
  return parseResponse<{ modes: LPMode[]; vNumber: number }>(response);
}

export async function requestSimulation(fiber: FiberParams, modes: ModeSetting[], display: DisplaySettings) {
  const response = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fiber, modes, display }) });
  const payload = await parseResponse<{ rgbaBase64: string; farRgbaBase64: string; totalPower: number; peak: number; crop: CropInfo; farCrop: CropInfo }>(response);
  const binary = atob(payload.rgbaBase64);
  const pixels = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i += 1) pixels[i] = binary.charCodeAt(i);
  const farBinary = atob(payload.farRgbaBase64);
  const farPixels = new Uint8ClampedArray(farBinary.length);
  for (let i = 0; i < farBinary.length; i += 1) farPixels[i] = farBinary.charCodeAt(i);
  return { ...payload, pixels, farPixels };
}
