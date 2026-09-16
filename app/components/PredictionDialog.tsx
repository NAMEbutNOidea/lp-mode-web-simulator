"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { jetColor } from "../lpPhysics";
import type { PredictionPayload } from "../services/predictionApi";
import { ErrorSymbol, MathInline, ModeLabel, Variable } from "./MathNotation";
import PredictionChart from "./PredictionChart";

function decodeBytes(base64: string) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function phaseColor(phase: number) {
  const h = (((phase + Math.PI) / (2 * Math.PI)) % 1 + 1) % 1 * 6;
  const f = h - Math.floor(h);
  return [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][Math.floor(h)];
}

function ImageCard({ title, sub, size, data, mask, phase = false }: { title: ReactNode; sub?: ReactNode; size: number; data: string; mask?: string; phase?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Each canvas draws on mount and data/size changes, including inference retries.
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const bytes = decodeBytes(data);
    const values = phase ? new Float32Array(bytes.buffer) : bytes;
    const alpha = mask ? decodeBytes(mask) : null;
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const [r, g, b] = phase ? phaseColor(values[i]) : jetColor(values[i] / 255);
      image.data[i * 4] = Math.round(r * 255);
      image.data[i * 4 + 1] = Math.round(g * 255);
      image.data[i * 4 + 2] = Math.round(b * 255);
      image.data[i * 4 + 3] = alpha ? (alpha[i] ? 255 : 0) : 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [data, mask, phase, size]);
  const id = useId();
  return <figure className="analysis-figure"><div className="analysis-canvas-frame"><canvas ref={ref} width={size} height={size} role="img" aria-labelledby={id}/></div><figcaption id={id}>{title}{sub && <small>{sub}</small>}</figcaption></figure>;
}

const views = ["总览", "光斑与残差", "相位分析", "模态系数"];

function ResultDeck({ children }: { children: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState("forward");
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function select(index: number) {
    const next = (index + views.length) % views.length;
    setDirection(next < active ? "backward" : "forward");
    setActive(next);
  }
  return <>
    <div className="result-tabs" role="tablist" aria-label="分析结果视图">{views.map((title, index) => <button key={title} ref={(el) => { tabs.current[index] = el; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onClick={() => select(index)} onKeyDown={(event) => {
      const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
      if (next != null) { event.preventDefault(); select(next); tabs.current[next]?.focus(); }
    }}>{title}</button>)}</div>
    <div className={`result-deck ${direction}`}>{children.map((content, index) => <section key={views[index]} className="result-deck-card" role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} hidden={active !== index}>{content}</section>)}</div>
    <nav className="result-deck-controls" aria-label="切换结果卡片"><button type="button" className="deck-arrow" onClick={() => select(active - 1)} aria-label="上一张结果卡片">←</button><button type="button" className="deck-arrow" onClick={() => select(active + 1)} aria-label="下一张结果卡片">→</button><div className="result-deck-dots">{views.map((title, index) => <button type="button" key={title} aria-label={`查看${title}`} aria-current={active === index ? "true" : undefined} className={active === index ? "active" : ""} onClick={() => select(index)}><span/></button>)}</div><span className="result-deck-counter" aria-live="polite">{active + 1} / {views.length}</span></nav>
  </>;
}

function Metric({ name, symbol, value }: { name: string; symbol: ReactNode; value: string }) {
  return <div className="metric-card"><span>{name}</span><div className="metric-symbol">{symbol}</div><strong>{value}</strong></div>;
}

function PredictionResults({ prediction }: { prediction: PredictionPayload }) {
  const ref = useRef<HTMLElement>(null);
  const { metrics, rows, images } = prediction;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const bounds = ref.current?.getBoundingClientRect();
      if (bounds && (bounds.top < 72 || bounds.top > window.innerHeight * .6)) ref.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function downloadJson() {
    const payload = { model: prediction.model, modeCount: prediction.modeCount, coefficients: prediction.coefficients, rows, metrics, norm: prediction.norm };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.download = `prediction_${prediction.model.name.replace(/[\\/]/g, "_").replace(/\.(pth|pt|ckpt)$/i, "")}.json`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const maximumWeightError = rows.reduce<(typeof rows)[number] | null>((max, row) => !max || row.weightAbsError > max.weightAbsError ? row : max, null);
  const maximumPhaseError = rows.slice(1).reduce<(typeof rows)[number] | null>((max, row) => !max || Math.abs(row.phaseError) > Math.abs(max.phaseError) ? row : max, null);
  return <section ref={ref} className="prediction-flow panel" aria-labelledby="prediction-title">
    <header className="settings-header prediction-heading"><div><p className="section-kicker">模态分解 · 分析结果</p><h2 id="prediction-title">模态系数预测与误差分析</h2><p>模型 {prediction.model.name} · {prediction.modeCount} 个模式 · {prediction.model.backbone} · {prediction.model.device} · 推理 {(prediction.model.elapsedMs / 1000).toFixed(2)} 秒</p></div><span className="prediction-complete">✓ 分析完成</span></header>
    <ResultDeck>{[
      <div key="overview">
        <div className="metric-strip">
          <Metric name="近场相关系数" symbol={<MathInline><msub><mi>r</mi><mtext>近场</mtext></msub></MathInline>} value={metrics.nearPearson.toFixed(4)}/>
          <Metric name="近场结构相似度" symbol={<MathInline><msub><mi mathvariant="normal">SSIM</mi><mtext>近场</mtext></msub></MathInline>} value={metrics.nearSsim.toFixed(4)}/>
          <Metric name="远场相关系数" symbol={<MathInline><msub><mi>r</mi><mtext>远场</mtext></msub></MathInline>} value={metrics.farPearson.toFixed(4)}/>
          <Metric name="远场结构相似度" symbol={<MathInline><msub><mi mathvariant="normal">SSIM</mi><mtext>远场</mtext></msub></MathInline>} value={metrics.farSsim.toFixed(4)}/>
          <Metric name="权重均方误差" symbol={<Variable name="MSE" index="w" normal/>} value={metrics.weightMse.toFixed(6)}/>
          <Metric name="相位平均绝对误差（弧度）" symbol={<Variable name="MAE" index="φ" normal/>} value={metrics.phaseMae.toFixed(4)}/>
        </div>
        <div className="prediction-overview-grid"><PredictionChart rows={rows} kind="weight"/><aside className="prediction-summary"><h3>本次分析摘要</h3><dl>
          <div><dt>权重绝对误差最大模式</dt><dd>{maximumWeightError ? <><ModeLabel label={maximumWeightError.label}/> · {maximumWeightError.weightAbsError.toFixed(4)}</> : "—"}</dd></div>
          <div><dt>相位误差最大模式（参考模态除外）</dt><dd>{maximumPhaseError ? <><ModeLabel label={maximumPhaseError.label}/> · {Math.abs(maximumPhaseError.phaseError).toFixed(4)} 弧度</> : "无非参考模态"}</dd></div>
          <div><dt>近场 / 远场平均绝对残差</dt><dd>{metrics.meanAbsResidualNear.toFixed(4)} / {metrics.meanAbsResidualFar.toFixed(4)}</dd></div>
          <div><dt>真值 / 预测权重范数</dt><dd>{prediction.norm.trueNorm.toFixed(4)} / {prediction.norm.predNorm.toFixed(4)}</dd></div>
        </dl><p>将指针移到柱状图上可查看真实值、预测值与误差。</p></aside></div>
      </div>,
      <div key="images">
        <section className="analysis-section"><h3>近场 · 真值、重构与残差</h3><div className="analysis-image-grid">
          <ImageCard title={<>近场真值 <Variable name="I"/></>} size={images.size} data={images.nearTrue}/>
          <ImageCard title={<>近场重构 <Variable name="I" hat/></>} sub={<>相关系数 {metrics.nearPearson.toFixed(4)} · 结构相似度 {metrics.nearSsim.toFixed(4)}</>} size={images.size} data={images.nearPred}/>
          <ImageCard title={<>近场绝对残差 <MathInline><mo>|</mo><mover accent="true"><mi>I</mi><mo>^</mo></mover><mo>−</mo><mi>I</mi><mo>|</mo></MathInline></>} size={images.size} data={images.nearResidual}/>
        </div></section>
        <section className="analysis-section"><h3>远场 · 真值、重构与残差</h3><div className="analysis-image-grid">
          <ImageCard title={<>远场真值 <Variable name="I"/></>} size={images.size} data={images.farTrue}/>
          <ImageCard title={<>远场重构 <Variable name="I" hat/></>} sub={<>相关系数 {metrics.farPearson.toFixed(4)} · 结构相似度 {metrics.farSsim.toFixed(4)}</>} size={images.size} data={images.farPred}/>
          <ImageCard title={<>远场绝对残差 <MathInline><mo>|</mo><mover accent="true"><mi>I</mi><mo>^</mo></mover><mo>−</mo><mi>I</mi><mo>|</mo></MathInline></>} size={images.size} data={images.farResidual}/>
        </div></section>
      </div>,
      <div key="phase">
        <section className="analysis-section"><h3>相位图 · 光强 ≥ 1% 处显示，色相编码</h3><div className="analysis-image-grid phase-grid"><ImageCard title={<>真实相位 <Variable name="φ"/></>} size={images.size} data={images.phaseTrue} mask={images.phaseMask} phase/><ImageCard title={<>重构相位 <Variable name="φ" hat/></>} size={images.size} data={images.phasePred} mask={images.phaseMask} phase/></div></section>
        <div className="prediction-chart-grid"><PredictionChart rows={rows} kind="phase"/><PredictionChart rows={rows} kind="phaseError"/></div>
        <p className="metric-note">相位误差按 2π 周期折回至 [−π, π)，平均绝对误差不包含首个参考模态。</p>
      </div>,
      <div key="coefficients">
        <section className="analysis-section"><h3>预测模态系数 · 真实值与模型输出</h3><div className="table-scroll"><table className="coefficient-table"><thead><tr><th>模式</th><th>真实权重 <Variable name="w" index="i"/></th><th>预测权重 <Variable name="w" index="i" hat/></th><th>真实相对相位 <Variable name="φ" index="i"/>（弧度）</th><th>预测相对相位 <Variable name="φ" index="i" hat/>（弧度）</th></tr></thead><tbody>{prediction.coefficients.map((row) => <tr key={row.label}><td><ModeLabel label={row.label}/></td><td>{row.trueWeight.toFixed(4)}</td><td>{row.predWeight.toFixed(4)}</td><td>{row.truePhase.toFixed(4)}</td><td>{row.predPhase.toFixed(4)}</td></tr>)}</tbody></table></div></section>
        <section className="analysis-section"><h3>各模态系数误差三线表</h3><div className="table-scroll three-line-scroll"><table className="three-line-table"><thead><tr><th>模式</th><th>真实权重 <Variable name="w" index="i"/></th><th>预测权重 <Variable name="w" index="i" hat/></th><th>绝对误差 <ErrorSymbol/></th><th>权重相对误差（%）</th><th>真实相位 <Variable name="φ" index="i"/>（弧度）</th><th>预测相位 <Variable name="φ" index="i" hat/>（弧度）</th><th>相位误差 <ErrorSymbol phase/>（弧度）</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td><ModeLabel label={row.label}/></td><td>{row.trueWeight.toFixed(4)}</td><td>{row.predWeight.toFixed(4)}</td><td className="weight-error-cell">{row.weightAbsError.toFixed(4)}</td><td>{row.weightRelErrorPercent.toFixed(3)}</td><td>{row.truePhase.toFixed(4)}</td><td>{row.predPhase.toFixed(4)}</td><td>{row.phaseError.toFixed(4)}</td></tr>)}</tbody></table></div></section>
      </div>,
    ]}</ResultDeck>
    <footer className="settings-footer"><span className="agent-footnote">所有图表与指标均来自当前仿真光斑和模型预测。</span><div className="prediction-actions"><button type="button" className="secondary-button" onClick={downloadJson}>下载分析数据（JSON）</button></div></footer>
  </section>;
}

export default function PredictionPanel({ prediction, busy }: { prediction: PredictionPayload | null; busy: boolean }) {
  if (busy) return <section className="prediction-flow panel" aria-busy="true" aria-label="模态预测与分析"><div className="prediction-busy" role="status"><span className="agent-spark" aria-hidden="true">✦</span>正在预测模态系数并计算误差…</div></section>;
  if (!prediction) return null;
  return <PredictionResults prediction={prediction}/>;
}
