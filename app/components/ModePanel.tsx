"use client";

import type { ModeSetting } from "../lpPhysics";
import { StepBadge } from "./SharedControls";
import { MathInline, ModeLabel, Variable } from "./MathNotation";

const PI = Math.PI;

export default function ModePanel({ modes, busy, normalized, norm, onUpdate, onRandom, onOpenSelector, onNormalize }: { modes: ModeSetting[]; busy: boolean; normalized: boolean; norm: number; onUpdate: (id: string, patch: Partial<ModeSetting>) => void; onRandom: () => void; onOpenSelector: () => void; onNormalize: () => void }) {
  const activeCount = modes.filter((mode) => mode.enabled).length;
  const familyCount = new Set(modes.map((mode) => `${mode.l}:${mode.m}`)).size;
  return <section className="center-column panel mode-panel">
    <div className="panel-heading mode-heading"><div><p className="section-kicker">第二步 · 模态设置</p><h2><StepBadge number={2} done={normalized}/>模态参数与幅度归一化</h2><p className="panel-copy">调整各模式的权重与相位，选择参与仿真的模式并完成幅度归一化。</p></div><div className="mode-heading-actions"><div className="mode-count-badge"><span>已开启 / 支持</span><strong>{modes.length ? `${activeCount}/${modes.length}` : "—"}</strong></div><button type="button" className="selector-button" onClick={onOpenSelector} disabled={!modes.length || busy}><span>▦</span> 模式选择</button><button className="random-button" onClick={onRandom} disabled={!modes.length || busy}><span>✦</span> 随机参数</button><button type="button" className={`normalize-inline-button heading-normalize ${normalized ? "done" : ""}`} onClick={onNormalize} disabled={!modes.length || busy}>{normalized ? "✓ 幅度已归一化" : "③ 幅度归一化"}</button></div></div>
    <section className="mode-formula" aria-labelledby="mode-formula-title">
      <div className="mode-formula-heading">
        <h3 id="mode-formula-title">少模激光 · 相干叠加</h3>
        <span>固定横截面的标量光场</span>
      </div>
      <div className="mode-formula-grid">
        <div className="mode-formula-item">
          <span className="mode-formula-label">复振幅叠加</span>
          <div className="mode-formula-expression">
            <math display="block" aria-label="E(x,y) 等于对所有启用模式 k 求和：a_k 乘以归一化模场 ψ_k(x,y)，再乘以 exp(iφ_k)">
              <mrow>
                <mrow><mi>E</mi><mo stretchy="false">(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo stretchy="false">)</mo></mrow>
                <mo>=</mo>
                <msub><mo largeop="false">∑</mo><mrow><mi>k</mi><mo>∈</mo><mi>S</mi></mrow></msub>
                <msub><mi>a</mi><mi>k</mi></msub>
                <mrow><msub><mi>ψ</mi><mi>k</mi></msub><mo stretchy="false">(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo stretchy="false">)</mo></mrow>
                <msup><mi mathvariant="normal">e</mi><mrow><mi mathvariant="normal">i</mi><msub><mi>φ</mi><mi>k</mi></msub></mrow></msup>
              </mrow>
            </math>
          </div>
        </div>
        <div className="mode-formula-item mode-formula-normalization">
          <span className="mode-formula-label">幅度归一化（权重非全零）</span>
          <div className="mode-formula-expression">
            <math display="block" aria-label="a_k 等于 w_k 除以所有启用模式的 w_j 平方和的平方根，且 a_k 平方和等于 1">
              <mrow>
                <msub><mi>a</mi><mi>k</mi></msub><mo>=</mo>
                <mfrac>
                  <msub><mi>w</mi><mi>k</mi></msub>
                  <msqrt><mrow><msub><mo largeop="false">∑</mo><mrow><mi>j</mi><mo>∈</mo><mi>S</mi></mrow></msub><msubsup><mi>w</mi><mi>j</mi><mn>2</mn></msubsup></mrow></msqrt>
                </mfrac>
                <mo>,</mo><mspace width="0.6em"/>
                <msub><mo largeop="false">∑</mo><mrow><mi>k</mi><mo>∈</mo><mi>S</mi></mrow></msub><msubsup><mi>a</mi><mi>k</mi><mn>2</mn></msubsup><mo>=</mo><mn>1</mn>
              </mrow>
            </math>
          </div>
        </div>
      </div>
      <p className="mode-formula-legend">
        <span><Variable name="S"/>：已启用的空间模式集合</span>
        <span><Variable name="ψ" index="k"/>：单位能量归一化 LP 模场</span>
        <span><Variable name="w" index="k"/> / <Variable name="a" index="k"/>：输入 / 归一化幅度权重</span>
        <span><Variable name="φ" index="k"/>：相位（弧度）</span>
      </p>
      <p className="mode-formula-note">模式名下的 <Variable name="u"/>、<Variable name="w"/> 为特征参数，与幅度权重 <Variable name="w" index="k"/> 不同。</p>
    </section>
    <div className="mode-table-header"><span>启用 / 模式</span><span>幅度权重 <Variable name="w" index="i"/></span><span>相位 <Variable name="φ" index="i"/></span></div>
    <div className={`mode-list ${!modes.length ? "empty" : ""}`}>{!modes.length ? <div className="empty-state"><span className="empty-orbit">◎</span><strong>等待模式检测</strong><p>设置左侧物理参数后，点击“检测支持的 LP 模式”。</p></div> : modes.map((mode) => <article className={`mode-row ${mode.enabled ? "enabled" : ""}`} key={mode.id}>
      <div className="mode-identity"><span className={`mode-state ${mode.enabled ? "on" : ""}`}>{mode.enabled ? "已选" : "未选"}</span><div><strong><ModeLabel l={mode.l} m={mode.m} parity={mode.parity}/></strong><small><MathInline><mi>u</mi><mo>=</mo><mn>{mode.u.toFixed(3)}</mn><mo>·</mo><mi>w</mi><mo>=</mo><mn>{mode.w.toFixed(3)}</mn></MathInline></small></div></div>
      <div className="control-pair"><input aria-label={`${mode.id} 幅度权重`} type="range" min="0" max="1" step="0.001" value={mode.weight} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { weight: Number(e.target.value) })}/><input aria-label={`${mode.id} 幅度数值`} className="compact-number" type="number" min="0" max="1" step="0.001" value={mode.weight.toFixed(3)} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { weight: Number(e.target.value) })}/></div>
      <div className="control-pair phase-control"><input aria-label={`${mode.id} 相位`} type="range" min={-PI} max={PI} step="0.01" value={mode.phase} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { phase: Number(e.target.value) })}/><input aria-label={`${mode.id} 相位数值`} className="compact-number" type="number" min={-PI} max={PI} step="0.01" value={mode.phase.toFixed(2)} disabled={!mode.enabled} onChange={(e) => onUpdate(mode.id, { phase: Number(e.target.value) })}/><small>弧度</small></div>
    </article>)}</div>
    <footer className="mode-footer">
      <div className="mode-footer-meta"><span>当前启用 <strong>{activeCount}</strong> / {modes.length} 个空间模式分量</span><span>LP 模式族 <strong>{familyCount}</strong> · <MathInline><mo>−</mo><mi>π</mi><mo>≤</mo><mi>φ</mi><mo>≤</mo><mi>π</mi></MathInline></span></div>
      <span className={`normalization-sum mode-footer-sum ${normalized ? "done" : ""}`}><MathInline label="当前幅度权重平方和"><msub><mo>∑</mo><mi>i</mi></msub><msubsup><mi>w</mi><mi>i</mi><mn>2</mn></msubsup><mo>=</mo><mn>{(norm * norm).toFixed(6)}</mn></MathInline></span>
    </footer>
  </section>;
}
