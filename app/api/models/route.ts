import { sidecarModels } from "../predictionBridge";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await sidecarModels());
  } catch (error) {
    return Response.json({
      models: [],
      pythonOk: false,
      pythonError: error instanceof Error ? error.message : "模型扫描失败",
      modelsDir: "",
    });
  }
}
