"use client";

import type { ModeSetting } from "../lpPhysics";
import { StepBadge } from "./SharedControls";

const PI = Math.PI;

export default function ModePanel({ modes, busy, onUpdate, onRandom, onOpenSelector }: { modes: ModeSetting[]; busy: boolean; onUpdate: (id: string, patch: Partial<ModeSetting>) => void; onRandom: () => void; onOpenSelector: () => void }) {
  const activeCount = modes.filter((mode) => mode.enabled).length;
  const familyCount = new Set(modes.map((mode) => `${mode.l}:${mode.m}`)).size;
  return <section className="center-column panel mode-panel">
    <div className="panel-heading mode-heading"><div><p className="section-kicker">STEP 02</p><h2><StepBadge number={2} done={modes.length > 0}/>调整各模式 w、φ</h2><p className="panel-copy">模式选择在子窗口中完成；关闭模式不会参与本次仿真。</p></div><div className="mode-heading-actions"><div className="mode-count-badge"><span>已开启 / 支持</span><strong>{modes.length ? `${activeCount}/${modes.length}` : "—"}</strong></div><button type="button" className="selector-button" onClick={onOpenSelector} disabled={!modes.length || busy}><span>▦</span> 模式选择</button><button className="random-button" onClick={onRandom} disabled={!modes.length || busy}><span>✦</span> 随机参数</button></div></div>
    <div className="mode-table-header"><span>启用 / 模式</span><span>幅度权重 w</span><span>相位 φ</span></div>
    <div className={`mode-list ${!modes.length ? "empty" : ""}`}>{!modes.length ? <div className="empty-state"><span className="empty-orbit">◎</span><strong>等待模式检测</strong><p>设置左侧物理参数后，点击“检测支持的 LP 模式”。</p></div> : modes.map((mode) => <article className={`mode-row ${mode.enabled ? "enabled" : ""}`} key={mode.id}>
      <div className="mode-identity"><span className={`mode-state ${mode.enabled ? "on" : ""}`}>{mode.enabled ? "已选" : "未选"}</span><div><strong>{mode.l === 0 ? `LP${mode.l}${mode.m}` : mode.id}</strong><small>u={mode.u.toFixed(3)} · w={mode.w.toFixed(3)}</small></div></div>
      <div className="control-pair"><input aria-label={`${mode.id} 幅度权重`} type="range" min="0" max="1" step="0.001" value={mode.weight} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { weight: Number(e.target.value) })}/><input aria-label={`${mode.id} 幅度数值`} className="compact-number" type="number" min="0" max="1" step="0.001" value={mode.weight.toFixed(3)} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { weight: Number(e.target.value) })}/></div>
      <div className="control-pair phase-control"><input aria-label={`${mode.id} 相位`} type="range" min={-PI} max={PI} step="0.01" value={mode.phase} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { phase: Number(e.target.value) })}/><input aria-label={`${mode.id} 相位数值`} className="compact-number" type="number" min={-PI} max={PI} step="0.01" value={mode.phase.toFixed(2)} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { phase: Number(e.target.value) })}/><small>rad</small></div>
    </article>)}</div>
    <footer className="mode-footer"><span>当前启用 <strong>{activeCount}</strong> / {modes.length} 个空间模式分量</span><span>LP 模式族 <strong>{familyCount}</strong> · φ 范围 −π 到 π</span></footer>
  </section>;
}
