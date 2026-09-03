"use client";

import { useEffect, useRef, useState } from "react";
import { requestModels, type ModelInfo, type ModelsResponse } from "../services/predictionApi";

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ModelAgentPanel({ selected, onSelect, onStatus, simModeCount, onConfigurePython }: {
  onConfigurePython: () => void;
  selected: ModelInfo | null;
  onSelect: (model: ModelInfo) => void;
  onStatus?: (message: string) => void;
  simModeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestModels();
      setData(result);
      onStatus?.(result.models.length ? `模型扫描完成：发现 ${result.models.length} 个模型` : "模型文件夹为空，请将 .pth 模型复制到 models 文件夹");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "模型扫描失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDocumentPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, [open]);

  const count = data?.models.length ?? 0;
  const selectedCount = data?.models.filter((model) => model.numModes).length ?? 0;
  const selectedMismatch = selected?.numModes != null && selected.numModes !== simModeCount;

  function togglePanel() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !data && !loading) void refresh();
  }

  return <div className="agent-fab-wrap" ref={wrapRef}>
    <div className={`agent-panel ${open ? "open" : ""}`}>
      <header className="agent-panel-header">
        <div className="agent-avatar" aria-hidden="true"><span className="agent-spark">✦</span></div>
        <div>
          <p className="agent-kicker">AI MODE ASSISTANT</p>
          <h3>模态分解模型</h3>
          <p className="agent-subtitle">扫描 models 文件夹 · 选择模型后用于预测</p>
        </div>
        <button type="button" className="agent-refresh" onClick={refresh} disabled={loading} aria-label="刷新模型列表" title="刷新模型列表">↻</button>
      </header>
      <div className="agent-body">
        {loading && <div className="agent-loading">正在扫描模型文件…</div>}
        {error && <div className="agent-error">{error}</div>}
        {data && !data.pythonOk && <div className="agent-warning">Python 环境不可用：{data.pythonError}<br/><button type="button" className="python-environment-link" onClick={onConfigurePython}>选择 Python / conda 环境</button></div>}
        {data && count === 0 && !loading && (
          <div className="agent-empty">
            将训练好的模型文件（<code>.pth</code> / <code>.pt</code> / <code>.ckpt</code>）复制到：<br/><code>{data.modelsDir}</code><br/>然后点击右上角 ↻ 刷新。
          </div>
        )}
        {data && count > 0 && <ul className="agent-model-list">
          {data.models.map((model) => {
            const active = selected?.name === model.name;
            const mismatch = model.numModes != null && model.numModes !== simModeCount;
            return <li key={model.name}>
              <button type="button" className={`agent-model-item ${active ? "selected" : ""} ${model.error ? "invalid" : ""}`} onClick={() => onSelect(model)} disabled={Boolean(model.error)}>
                <span className="agent-model-check">{active ? "✓" : ""}</span>
                <span className="agent-model-info">
                  <strong>{model.name}</strong>
                  <small>{model.numModes ? `${model.numModes} 个模式 · ${model.backbone} · ${model.sizeLabel}` : (model.error ?? "未识别")} · {formatTime(model.mtime)}</small>
                  {mismatch && <em className="agent-mismatch">模式数不匹配：模型 {model.numModes} ≠ 仿真 {simModeCount}</em>}
                </span>
              </button>
            </li>;
          })}
        </ul>}
        {data && count > 0 && <p className="agent-footnote">已识别 {selectedCount} / {count} 个模型；{selectedMismatch ? <strong className="agent-mismatch-inline">当前模型与仿真模式数不一致，请调整光纤参数。</strong> : "预测前需保持仿真模式数与模型一致。"}</p>}
      </div>
    </div>
    <button type="button" className={`agent-fab ${open ? "open" : ""}`} onClick={togglePanel} aria-expanded={open} title="AI 模态分解助手">
      <span className="agent-fab-icon">✦</span>
      <span className="agent-fab-label">{open ? "收起" : "模型"}</span>
      <span className={`agent-fab-dot ${selected ? "selected" : ""}`} />
    </button>
  </div>;
}
