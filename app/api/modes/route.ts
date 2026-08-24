import { calculateV, discoverSupportedModes, type FiberParams } from "../../lpPhysics";

export async function POST(request: Request) {
  try {
    const { fiber } = await request.json() as { fiber: FiberParams };
    if (!fiber || fiber.coreRadius <= 0 || fiber.na <= 0 || fiber.wavelength <= 0 || fiber.zoneSize <= 0) {
      return Response.json({ error: "光纤参数必须为正数" }, { status: 400 });
    }
    return Response.json({ modes: discoverSupportedModes(fiber), vNumber: calculateV(fiber) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "模式检测失败" }, { status: 500 });
  }
}
