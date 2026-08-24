"use client";

import type { FiberParams } from "../lpPhysics";
import { NumericField, StepBadge } from "./SharedControls";

export default function FiberPanel({ fiber, vNumber, detected, supportedCount, familyCount, busy, onChange, onDetect }: { fiber: FiberParams; vNumber: number; detected: boolean; supportedCount: number; familyCount: number; busy: boolean; onChange: <K extends keyof FiberParams>(key: K, value: FiberParams[K]) => void; onDetect: () => void }) {
  return <section className="panel parameter-panel">
    <div className="panel-heading"><div><p className="section-kicker">STEP 01</p><h2><StepBadge number={1} done={detected}/>设置光纤参数</h2></div><span className="v-chip">V = {vNumber.toFixed(4)}</span></div>
    <p className="panel-copy">采用与 MATLAB 脚本一致的弱导标量 LP 模式模型。</p>
    <div className="field-grid">
      <NumericField label="纤芯半径 a" value={fiber.coreRadius} unit="μm" min={1} max={50} step={0.1} onChange={(v) => onChange("coreRadius", v)}/>
      <NumericField label="数值孔径 NA" value={fiber.na} unit="" min={0.01} max={0.5} step={0.001} onChange={(v) => onChange("na", v)}/>
      <NumericField label="工作波长 λ" value={fiber.wavelength * 1000} unit="nm" min={300} max={2000} step={0.1} onChange={(v) => onChange("wavelength", v / 1000)}/>
      <NumericField label="计算区域" value={fiber.zoneSize} unit="μm" min={20} max={300} step={1} onChange={(v) => onChange("zoneSize", v)}/>
    </div>
    <div className="equation-strip"><span>归一化频率</span><code>V = 2πa·NA / λ</code></div>
    <div className={`supported-mode-card ${detected ? "ready" : ""}`} aria-live="polite">
      <div><span>支持的空间模式分量</span><strong>{detected ? supportedCount : "—"}</strong><small>与 MATLAB modeLabels 数量一致，包含 e/o</small></div>
      <div><span>LP 模式族</span><strong>{detected ? familyCount : "—"}</strong><small>同一 LP<sub>lm</sub> 的 e/o 合并计数</small></div>
    </div>
    <button className="primary-button full" onClick={onDetect} disabled={busy}><span className="button-icon">⌁</span>{busy ? "正在求解…" : "检测支持的 LP 模式"}</button>
  </section>;
}
