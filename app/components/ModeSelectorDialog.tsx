"use client";

import { Fragment } from "react";
import type { ModeSetting } from "../lpPhysics";

function displayLabel(mode: ModeSetting) {
  return `LP${mode.l}${mode.m}`;
}

export default function ModeSelectorDialog({ open, modes, busy, onToggle, onSetAll, onClose }: { open: boolean; modes: ModeSetting[]; busy: boolean; onToggle: (id: string) => void; onSetAll: (enabled: boolean) => void; onClose: () => void }) {
  if (!open) return null;
  const activeCount = modes.filter((mode) => mode.enabled).length;
  const lValues = [...new Set(modes.map((mode) => mode.l))];
  const mValues = [...new Set(modes.map((mode) => mode.m))];
  return <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="settings-dialog mode-selector-dialog" role="dialog" aria-modal="true" aria-labelledby="mode-selector-title">
      <header className="settings-header"><div><p className="section-kicker">MODE SELECTION</p><h2 id="mode-selector-title">选择参与仿真的 LP 模式</h2><p>点击矩阵中的模式卡片即可开启或关闭；当前已开启 {activeCount} / {modes.length} 个空间模式分量。</p></div><button type="button" className="close-button" aria-label="关闭模式选择" onClick={onClose}>×</button></header>
      <div className="mode-selector-toolbar"><button type="button" className="batch-button enable" onClick={() => onSetAll(true)} disabled={!modes.length || busy || activeCount === modes.length}>全选开启</button><button type="button" className="batch-button disable" onClick={() => onSetAll(false)} disabled={!modes.length || busy || activeCount === 0}>全部关闭</button><span>模式变更后需重新归一化</span></div>
      <div className="mode-matrix-scroll"><div className="mode-order-matrix" style={{ gridTemplateColumns: `68px repeat(${mValues.length}, minmax(86px, 1fr))` }}>
        <div className="matrix-corner">l \ m</div>{mValues.map((m) => <div className="matrix-column-label" key={`m-${m}`}>m = {m}</div>)}
        {lValues.map((l) => <Fragment key={`l-${l}`}><div className="matrix-row-label">l = {l}</div>{mValues.map((m) => { const group = modes.filter((mode) => mode.l === l && mode.m === m); return <div className={`matrix-mode-cell ${group.length ? "available" : ""}`} key={`${l}:${m}`}>{group.map((mode) => <button type="button" key={mode.id} className={`matrix-mode-option ${mode.enabled ? "selected" : ""}`} aria-pressed={mode.enabled} disabled={busy} onClick={() => onToggle(mode.id)}><span>{displayLabel(mode)}</span>{mode.l !== 0 && <small>{mode.parity}</small>}</button>)}</div>; })}</Fragment>)}
      </div></div>
      <footer className="settings-footer"><span className="mode-selector-total">已选择 <strong>{activeCount}</strong> / {modes.length}</span><button type="button" className="settings-done-button" onClick={onClose}>完成选择</button></footer>
    </section>
  </div>;
}
