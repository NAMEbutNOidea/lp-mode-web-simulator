import { BridgeError, sidecarPythonEnvironments, sidecarUpdatePythonEnvironment } from "../predictionBridge";

export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && (!origin || origin === url.origin);
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "Python 环境仅支持从本机网页管理。" }, { status: 403 });
  try {
    return Response.json(await sidecarPythonEnvironments(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取环境失败" }, { status: error instanceof BridgeError ? error.status : 500 });
  }
}

export async function POST(request: Request) {
  if (!isLocalRequest(request)) return Response.json({ error: "Python 环境仅支持从本机网页管理。" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "请使用 JSON 提交环境配置。" }, { status: 415 });
  }
  let body: { action?: unknown; pythonPath?: unknown } | null;
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "请求体不是有效 JSON。" }, { status: 400 }); }
  if (!body || (body.action !== "check" && body.action !== "select") || typeof body.pythonPath !== "string") {
    return Response.json({ error: "请选择环境并指定检查或应用操作。" }, { status: 400 });
  }
  try {
    return Response.json(await sidecarUpdatePythonEnvironment({ action: body.action, pythonPath: body.pythonPath }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "应用环境失败" }, { status: error instanceof BridgeError ? error.status : 500 });
  }
}
