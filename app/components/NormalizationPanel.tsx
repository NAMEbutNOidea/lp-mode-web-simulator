"use client";

import { StepBadge } from "./SharedControls";

export default function NormalizationPanel({ norm, normalized, disabled, onNormalize }: { norm: number; normalized: boolean; disabled: boolean; onNormalize: () => void }) {
  return <section className="panel normalization-panel">
    <div className="panel-heading compact"><div><p className="section-kicker">STEP 03</p><h2><StepBadge number={3} done={normalized}/>幅度归一化</h2></div></div>
    <div className="norm-readout"><div><span>当前模长</span><strong>{norm.toFixed(6)}</strong></div><div><span>Σ wᵢ²</span><strong>{(norm * norm).toFixed(6)}</strong></div></div>
    <div className="norm-meter"><span style={{ width: `${Math.min(norm, 1) * 100}%` }}/></div>
    <button className="secondary-button full" onClick={onNormalize} disabled={disabled}>归一化全部启用模式</button>
  </section>;
}
