import { calculateV, discoverSupportedModes, type DisplaySettings, type FiberParams } from "../../lpPhysics";
import { sidecarFiberProfileJob, sidecarFiberProfiles, sidecarStartFiberProfileJob } from "../predictionBridge";
import type { FiberProfileJob, FiberProfilesResponse } from "../../services/fiberProfilesApi";

export const runtime = "nodejs";

function validFiber(fiber: FiberParams | undefined): fiber is FiberParams {
  return Boolean(
    fiber
    && Number.isFinite(fiber.coreRadius) && fiber.coreRadius > 0
    && Number.isFinite(fiber.na) && fiber.na > 0
    && Number.isFinite(fiber.wavelength) && fiber.wavelength > 0
    && Number.isFinite(fiber.zoneSize) && fiber.zoneSize > 0
    && Number.isInteger(fiber.maxL) && fiber.maxL >= 1 && fiber.maxL <= 20
    && Number.isInteger(fiber.maxM) && fiber.maxM >= 1 && fiber.maxM <= 20
  );
}

export async function GET(request: Request) {
  try {
    const jobId = new URL(request.url).searchParams.get("job");
    if (jobId) return Response.json(await sidecarFiberProfileJob(jobId) as { job: FiberProfileJob });
    return Response.json(await sidecarFiberProfiles() as FiberProfilesResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取自定义光纤组合失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; fiber?: FiberParams; display?: Partial<DisplaySettings> };
    const name = body.name?.trim() ?? "";
    if (!name) return Response.json({ error: "请输入组合名称" }, { status: 400 });
    if (!validFiber(body.fiber)) return Response.json({ error: "光纤参数无效，maxL / maxM 应为 1–20 的整数" }, { status: 400 });

    const modes = discoverSupportedModes(body.fiber);
    if (!modes.length) return Response.json({ error: "当前光纤参数没有检测到支持模式，无法校准" }, { status: 400 });
    const display = body.display ?? {};
    const result = await sidecarStartFiberProfileJob({
      name,
      fiber: body.fiber,
      modes,
      vNumber: calculateV(body.fiber),
      calibration: {
        samples: 50,
        percentile: 95,
        safety: 1.10,
        seed: 20260713,
        energyFraction: Math.max(0.5, Math.min(0.999, display.energyFraction ?? 0.95)),
        paddingFactor: Math.max(1, Math.min(2, display.paddingFactor ?? 1.12)),
        gamma: Math.max(0.1, Math.min(2, display.gamma ?? 0.7)),
        gridSize: Math.max(128, Math.min(600, Math.round(display.gridSize ?? 600))),
        fftRatio: Math.max(1, Math.min(4, Math.round(display.fftRatio ?? 4))),
        outputSize: Math.max(64, Math.min(320, Math.round(display.outputSize ?? 224))),
      },
    });
    return Response.json(result as { job: FiberProfileJob }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存自定义光纤组合失败" }, { status: 500 });
  }
}
