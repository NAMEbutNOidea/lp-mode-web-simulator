"use client";

import type { RefObject } from "react";
import type { CropInfo, DisplaySettings } from "../lpPhysics";
import { StepBadge } from "./SharedControls";
import { MathInline, Variable } from "./MathNotation";

export default function SimulationPanel({ nearCanvasRef, farCanvasRef, simulated, busy, hasModes, totalPower, display, nearCrop, farCrop, onSimulate, onDownloadNear, onDownloadFar, onPredict, canPredict, modelSelected, predicting, modeCountMatches, modelNumModes, simModeCount }: { nearCanvasRef: RefObject<HTMLCanvasElement | null>; farCanvasRef: RefObject<HTMLCanvasElement | null>; simulated: boolean; busy: boolean; hasModes: boolean; totalPower: number; display: DisplaySettings; nearCrop: CropInfo | null; farCrop: CropInfo | null; onSimulate: () => void; onDownloadNear: () => void; onDownloadFar: () => void; onPredict: () => void; canPredict: boolean; modelSelected: boolean; predicting: boolean; modeCountMatches: boolean; modelNumModes: number | null; simModeCount: number }) {
  return <section className="panel simulation-panel">
    <div className="panel-heading compact"><div><p className="section-kicker">第三步 · 光斑仿真</p><h2><StepBadge number={3} done={simulated}/>仿真单张光斑</h2></div><span className="resolution-chip">{display.outputSize} × {display.outputSize}</span></div>
    <div className="simulation-planes">
      <article className="plane-card"><div className="plane-title"><strong>近场</strong><span><MathInline><msup><mrow><mo>|</mo><mi>E</mi><mo>|</mo></mrow><mn>2</mn></msup></MathInline> · 伪彩色</span></div><div className={`canvas-frame ${simulated ? "has-result" : ""}`}><canvas ref={nearCanvasRef} width={display.outputSize} height={display.outputSize} aria-label="伪彩色近场光斑"/></div><small>{nearCrop && display.autoCrop ? `裁剪比例 ${nearCrop.cropRatio.toFixed(3)}` : "完整计算视场"}</small></article>
      <article className="plane-card"><div className="plane-title"><strong>远场</strong><span>傅里叶变换 · 伪彩色</span></div><div className={`canvas-frame ${simulated ? "has-result" : ""}`}><canvas ref={farCanvasRef} width={display.outputSize} height={display.outputSize} aria-label="伪彩色远场光斑"/></div><small>{farCrop && display.autoCrop ? `裁剪比例 ${farCrop.cropRatio.toFixed(3)}` : "完整频域视场"}</small></article>
    </div>
    <div className="result-meta"><div><span>输出</span><strong>近场 + 远场</strong></div><div><span>伽马 <Variable name="γ"/></span><strong>{display.gamma.toFixed(2)}</strong></div><div><span>总功率</span><strong>{simulated ? totalPower.toFixed(4) : "—"}</strong></div></div>
    <div className="crop-summary"><span className={display.autoCrop ? "enabled" : ""}>{display.autoCrop ? (display.cropMode === "fixed" ? "使用自定义组合的统一固定裁剪" : `近远场均按 ${(display.energyFraction * 100).toFixed(1)}% 能量裁剪`) : "自动裁剪已关闭"}</span><strong>{nearCrop && display.autoCrop ? `近场视场 ${nearCrop.physicalWidth.toFixed(2)} 微米` : "完整计算视场"}</strong></div>
    <button className="simulate-button full" onClick={onSimulate} disabled={!hasModes || busy}><span className="play-icon">▶</span>{busy ? "计算中…" : "开始仿真"}</button>
    <div className="download-button-group"><button className="download-button" onClick={onDownloadNear} disabled={!simulated}>下载近场 PNG</button><button className="download-button" onClick={onDownloadFar} disabled={!simulated}>下载远场 PNG</button></div>
    <button className={`predict-button full ${canPredict ? "ready" : "waiting"}`} onClick={onPredict} disabled={!modelSelected || busy || predicting}><span className="ai-icon">✦</span>{predicting ? "模型预测中…" : "模态预测（智能分解）"}</button>
    <p className="predict-hint">{!modelSelected ? "先在右下角“模型”中选择训练好的分解模型" : !simulated ? "请先完成光斑仿真，再执行模态预测" : !modeCountMatches ? `模型需要 ${modelNumModes} 个模式，当前仿真启用 ${simModeCount} 个：请调整光纤参数（如 NA / 纤芯半径）重新检测模式，使两者一致` : "将使用当前近场/远场光斑预测各模态权重与相对相位"}</p>
  </section>;
}
