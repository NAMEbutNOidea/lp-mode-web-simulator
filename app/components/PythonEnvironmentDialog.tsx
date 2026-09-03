"use client";

import { useEffect, useRef, useState } from "react";
import { requestPythonEnvironments, updatePythonEnvironment, type PythonEnvironmentReport, type PythonEnvironmentStatus } from "../services/pythonEnvironmentApi";

export default function PythonEnvironmentDialog({ disabled, onClose, onApplied }: {
  disabled: boolean;
  onClose: () => void;
  onApplied: (path: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<PythonEnvironmentStatus | null>(null);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"check" | "select" | null>(null);
  const [report, setReport] = useState<PythonEnvironmentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const busy = loading || pending !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    let cancelled = false;
    requestPythonEnvironments().then((result) => {
      if (cancelled) return;
      setData(result);
      setPath(result.activePath || result.environments[0]?.path || "");
    }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "读取环境失败"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; dialog?.close(); };
  }, []);

  function changePath(value: string) {
    setPath(value);
    setReport(null);
    setError(null);
    setMessage("");
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try { setData(await requestPythonEnvironments()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "读取环境失败"); }
    finally { setLoading(false); }
  }

  async function submit(action: "check" | "select") {
    setPending(action);
    setReport(null);
    setError(null);
    setMessage("");
    try {
      const result = await updatePythonEnvironment(path.trim(), action);
      setReport(result.report);
      setData(result);
      if (result.applied) {
        setMessage("已保存并应用，后续模型预测和光纤校准将使用此环境。");
        onApplied(result.report.pythonPath);
      } else if (!result.report.ok) {
        setError("依赖检查未通过，当前环境未更改。请在所选环境中安装或修复下方依赖后重试。");
      } else {
        setMessage("依赖检查通过，点击“应用此环境”即可切换。");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "环境检查失败"); }
    finally { setPending(null); }
  }

  return <dialog ref={dialogRef} className="python-environment-dialog" aria-labelledby="python-env-title" onCancel={(event) => { event.preventDefault(); if (!pending) onClose(); }}>
    <header className="settings-header">
      <div><p className="section-kicker">PYTHON / CONDA</p><h2 id="python-env-title">Python 环境</h2><p>为模型预测和光纤校准选择本机环境。</p></div>
      <button type="button" className="close-button" onClick={onClose} disabled={pending !== null} aria-label="关闭 Python 环境">×</button>
    </header>
    <div className="python-environment-body">
      <div className="python-environment-current"><strong>当前使用</strong><code>{data?.activePath || (loading ? "正在读取…" : "尚未找到环境")}</code></div>
      {data?.configError && <p className="agent-warning">{data.configError}</p>}
      <div className="python-environment-label"><label htmlFor="python-env-select">已发现的环境</label><button type="button" className="reset-button" onClick={refresh} disabled={busy}>重新扫描</button></div>
      <select id="python-env-select" value={data?.environments.some((item) => item.path === path) ? path : ""} onChange={(event) => changePath(event.target.value)} disabled={busy}>
        <option value="">手动填写解释器路径</option>
        {data?.environments.map((item) => <option key={item.path} value={item.path}>{item.name} · {item.path}</option>)}
      </select>
      {!loading && data?.environments.length === 0 && <p className="python-environment-help">未自动发现环境，可在下方填写 conda 环境中的 python.exe 路径。</p>}
      <label className="python-environment-path" htmlFor="python-env-path"><span>Python 解释器完整路径</span><input id="python-env-path" value={path} onChange={(event) => changePath(event.target.value)} disabled={busy} spellCheck={false} placeholder="粘贴 conda 环境中的 python.exe 完整路径"/></label>
      <p className="python-environment-help">可在已激活的 conda 终端运行 <code>python -c &quot;import sys; print(sys.executable)&quot;</code> 查找路径。</p>
      {pending && <p className="python-environment-notice" role="status">正在启动 Python 并检查依赖，首次加载可能需要约一分钟…</p>}
      {error && <p className="agent-error" role="alert">{error}</p>}
      {message && <p className="python-environment-notice" role="status">{message}</p>}
      {report && <section className="python-environment-report" aria-label="依赖检查结果"><strong>Python {report.version} · {report.ok ? "依赖完整" : "需要修复依赖"}</strong><ul>{report.packages.map((item) => <li key={item.name} className={item.ok ? "available" : "unavailable"}><span>{item.ok ? "✓" : "!"} {item.name}</span><span>{item.ok ? item.version || "可用" : item.error || "无法导入"}</span></li>)}</ul>{!report.ok && <p>在所选环境中执行 <code>python -m pip install -r requirements.txt</code>，然后重新检查。</p>}</section>}
      {disabled && <p className="agent-warning">预测或校准正在进行，请等待完成后再切换环境。</p>}
      <p className="python-environment-help">选择仅保存在本机，重启后仍有效，无需修改启动脚本。</p>
    </div>
    <footer className="settings-footer"><button type="button" className="reset-button" onClick={() => submit("check")} disabled={busy || !path.trim()}>检查依赖</button><button type="button" className="settings-done-button" onClick={() => submit("select")} disabled={busy || disabled || !path.trim()}>{pending === "select" ? "检查并应用中…" : "应用此环境"}</button></footer>
  </dialog>;
}
