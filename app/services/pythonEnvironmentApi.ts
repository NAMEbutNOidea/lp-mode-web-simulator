export type PythonEnvironment = { name: string; path: string; source: string };
export type PythonEnvironmentStatus = {
  environments: PythonEnvironment[];
  activePath: string | null;
  selectionSource: "saved" | "environment" | "auto" | "none";
  configError: string | null;
};
export type PythonEnvironmentReport = {
  ok: boolean;
  pythonPath: string;
  version: string;
  packages: Array<{ name: string; ok: boolean; version: string | null; error: string | null }>;
};
export type PythonEnvironmentResult = PythonEnvironmentStatus & { applied: boolean; report: PythonEnvironmentReport };

export async function requestPythonEnvironments() {
  const response = await fetch("/api/python-environments", { cache: "no-store" });
  const data = await response.json() as PythonEnvironmentStatus & { error?: string };
  if (!response.ok) throw new Error(data.error || "无法读取 Python 环境");
  return data as PythonEnvironmentStatus;
}

export async function updatePythonEnvironment(pythonPath: string, action: "check" | "select") {
  const response = await fetch("/api/python-environments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pythonPath, action }),
  });
  const data = await response.json() as PythonEnvironmentResult & { error?: string };
  if (!response.ok) throw new Error(data.error || "Python 环境检查失败");
  return data as PythonEnvironmentResult;
}
