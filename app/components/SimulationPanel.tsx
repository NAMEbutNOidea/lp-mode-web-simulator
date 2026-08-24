"use client";

import type { RefObject } from "react";
import type { CropInfo, DisplaySettings } from "../lpPhysics";
import { StepBadge } from "./SharedControls";

export default function SimulationPanel({ nearCanvasRef, farCanvasRef, simulated, busy, hasModes, totalPower, display, nearCrop, farCrop, onSimulate, onDownloadNear, onDownloadFar }: { nearCanvasRef: RefObject<HTMLCanvasElement | null>; farCanvasRef: RefObject<HTMLCanvasElement | null>; simulated: boolean; busy: boolean; hasModes: boolean; totalPower: number; display: DisplaySettings; nearCrop: CropInfo | null; farCrop: CropInfo | null; onSimulate: () => void; onDownloadNear: () => void; onDownloadFar: () => void }) {
  return <section className="panel simulation-panel">
    <div className="panel-heading compact"><div><p className="section-kicker">STEP 04</p><h2><StepBadge number={4} done={simulated}/>仿真单张光斑</h2></div><span className="resolution-chip">{display.outputSize} × {display.outputSize}</span></div>
    <div className="simulation-planes">
      <article className="plane-card"><div className="plane-title"><strong>近场</strong><span>|E|²</span></div><div className={`canvas-frame ${simulated ? "has-result" : ""}`}><canvas ref={nearCanvasRef} width={display.outputSize} height={display.outputSize} aria-label="近场光斑"/></div><small>{nearCrop && display.autoCrop ? `裁剪比例 ${nearCrop.cropRatio.toFixed(3)}` : "完整计算视场"}</small></article>
      <article className="plane-card"><div className="plane-title"><strong>远场</strong><span>FFT</span></div><div className={`canvas-frame ${simulated ? "has-result" : ""}`}><canvas ref={farCanvasRef} width={display.outputSize} height={display.outputSize} aria-label="远场光斑"/></div><small>{farCrop && display.autoCrop ? `裁剪比例 ${farCrop.cropRatio.toFixed(3)}` : "完整频域视场"}</small></article>
    </div>
    <div className="result-meta"><div><span>输出</span><strong>近场 + 远场</strong></div><div><span>Gamma</span><strong>{display.gamma.toFixed(2)}</strong></div><div><span>总功率</span><strong>{simulated ? totalPower.toFixed(4) : "—"}</strong></div></div>
    <div className="crop-summary"><span className={display.autoCrop ? "enabled" : ""}>{display.autoCrop ? `近远场均按 ${(display.energyFraction * 100).toFixed(1)}% 能量裁剪` : "自动裁剪已关闭"}</span><strong>{nearCrop && display.autoCrop ? `近场视场 ${nearCrop.physicalWidth.toFixed(2)} μm` : "完整计算视场"}</strong></div>
    <button className="simulate-button full" onClick={onSimulate} disabled={!hasModes || busy}><span className="play-icon">▶</span>{busy ? "计算中…" : "开始仿真"}</button>
    <div className="download-button-group"><button className="download-button" onClick={onDownloadNear} disabled={!simulated}>下载近场 PNG</button><button className="download-button" onClick={onDownloadFar} disabled={!simulated}>下载远场 PNG</button></div>
  </section>;
}
