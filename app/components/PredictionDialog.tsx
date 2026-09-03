"use client";

import { useEffect, useRef, type RefObject } from "react";
import { jetColor } from "../lpPhysics";
import type { ErrorRow, PredictionPayload } from "../services/predictionApi";

function decodeBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeFloats(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

function hsvToRgb(hue: number, saturation: number, value: number) {
  const h = ((hue % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);
  switch (i % 6) {
    case 0: return [value, t, p];
    case 1: return [q, value, p];
    case 2: return [p, value, t];
    case 3: return [p, q, value];
    case 4: return [t, p, value];
    default: return [value, p, q];
  }
}

function fillCanvas(canvas: HTMLCanvasElement | null, render: (context: CanvasRenderingContext2D, size: number) => void, size: number) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, size, size);
  render(context, size);
}

function drawJetIntensity(canvas: HTMLCanvasElement | null, base64: string, size: number) {
  fillCanvas(canvas, (context, pixelSize) => {
    const bytes = decodeBytes(base64);
    const image = context.createImageData(pixelSize, pixelSize);
    for (let i = 0; i < bytes.length; i += 1) {
      const [red, green, blue] = jetColor(bytes[i] / 255);
      image.data[i * 4] = Math.round(red * 255);
      image.data[i * 4 + 1] = Math.round(green * 255);
      image.data[i * 4 + 2] = Math.round(blue * 255);
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, size);
}

function drawJet(canvas: HTMLCanvasElement | null, base64: string, size: number) {
  fillCanvas(canvas, (context, pixelSize) => {
    const bytes = decodeBytes(base64);
    const image = context.createImageData(pixelSize, pixelSize);
    for (let i = 0; i < bytes.length; i += 1) {
      const [r, g, b] = jetColor(bytes[i] / 255);
      image.data[i * 4] = Math.round(r * 255);
      image.data[i * 4 + 1] = Math.round(g * 255);
      image.data[i * 4 + 2] = Math.round(b * 255);
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, size);
}

function drawPhase(canvas: HTMLCanvasElement | null, phaseBase64: string, maskBase64: string, size: number) {
  fillCanvas(canvas, (context, pixelSize) => {
    const phases = decodeFloats(phaseBase64);
    const mask = decodeBytes(maskBase64);
    const image = context.createImageData(pixelSize, pixelSize);
    for (let i = 0; i < phases.length; i += 1) {
      const hue = (phases[i] + Math.PI) / (2 * Math.PI);
      const [r, g, b] = hsvToRgb(hue, 1, 1);
      image.data[i * 4] = Math.round(r * 255);
      image.data[i * 4 + 1] = Math.round(g * 255);
      image.data[i * 4 + 2] = Math.round(b * 255);
      image.data[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    context.putImageData(image, 0, 0);
  }, size);
}

function ImageCard({ title, sub, canvasRef }: { title: string; sub?: string; canvasRef: RefObject<HTMLCanvasElement | null> }) {
  return <figure className="analysis-figure">
    <div className="analysis-canvas-frame"><canvas ref={canvasRef} width={224} height={224}/></div>
    <figcaption>{title}{sub ? <small>{sub}</small> : null}</figcaption>
  </figure>;
}

function ModeTicks({ labels, step, axisY }: { labels: string[]; step: number; axisY: number }) {
  const every = Math.max(1, Math.ceil(labels.length / 24));
  return <g>
    {labels.map((label, index) => index % every === 0
      ? <g key={label}>
          <line x1={index * step + step / 2} x2={index * step + step / 2} y1={axisY} y2={axisY + 4} className="chart-axis"/>
          <text x={index * step + step / 2} y={axisY + 13} textAnchor="middle" className="chart-mode-tick">{label}</text>
        </g>
      : null)}
  </g>;
}

function GroupedBarChart({ title, rows, getTrue, getPred, yMax, yLabel, legend, centerZero }: {
  title: string;
  rows: ErrorRow[];
  getTrue: (row: ErrorRow) => number;
  getPred: (row: ErrorRow) => number;
  yMax: number;
  yLabel: string;
  legend?: boolean;
  centerZero?: boolean;
}) {
  const count = rows.length;
  const plotWidth = Math.max(200, count * 18);
  const step = plotWidth / Math.max(1, count);
  const height = 190;
  const chartHeight = 148;
  const padTop = 14;
  const padLeft = 42;
  const padRight = 8;
  const width = plotWidth + padLeft + padRight;
  const scale = chartHeight / (centerZero ? 2 * yMax : yMax);
  const barWidth = Math.min(12, Math.max(3, step * 0.28));
  const baseline = padTop + (centerZero ? chartHeight / 2 : chartHeight);
  const plotBottom = padTop + chartHeight;
  const ticks = centerZero
    ? [-yMax, -yMax / 2, 0, yMax / 2, yMax]
    : [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  return <div className="chart-block">
    <h4>{title}</h4>
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} className="analysis-chart" role="img" aria-label={title}>
        <g transform={`translate(${padLeft},0)`}>
          {ticks.map((tick) => {
            const y = baseline - tick * scale;
            return <g key={tick}>
              <line x1={0} x2={count * step} y1={y} y2={y} className="chart-grid-line"/>
              <text x={-8} y={y + 4} textAnchor="end" className="chart-axis-tick">{tick.toFixed(2)}</text>
            </g>;
          })}
          <line x1={0} x2={plotWidth} y1={plotBottom} y2={plotBottom} className="chart-axis"/>
          {centerZero ? <line x1={0} x2={plotWidth} y1={baseline} y2={baseline} className="chart-zero-axis"/> : null}
          {rows.map((row, index) => {
            const x = index * step + step / 2;
            const trueValue = getTrue(row);
            const predValue = getPred(row);
            const trueHeight = Math.abs(trueValue) * scale;
            const predHeight = Math.abs(predValue) * scale;
            return <g key={row.label}>
              <rect x={x - barWidth - 1} y={trueValue >= 0 ? baseline - trueHeight : baseline} width={barWidth} height={trueHeight} className="chart-bar-true"/>
              <rect x={x + 1} y={predValue >= 0 ? baseline - predHeight : baseline} width={barWidth} height={predHeight} className="chart-bar-pred"/>
            </g>;
          })}
          <ModeTicks labels={rows.map((row) => row.label)} step={step} axisY={plotBottom}/>
          {legend ? <g transform={`translate(${Math.max(0, plotWidth - 116)}, 3)`}>
            <rect x={0} y={0} width={9} height={9} className="chart-bar-true"/><text x={14} y={9} className="chart-legend">True</text>
            <rect x={56} y={0} width={9} height={9} className="chart-bar-pred"/><text x={70} y={9} className="chart-legend">Pred</text>
          </g> : null}
        </g>
        <text x={padLeft - 30} y={height / 2} transform={`rotate(-90 ${padLeft - 30} ${height / 2})`} textAnchor="middle" className="chart-axis-label">{yLabel}</text>
        <text x={padLeft + plotWidth / 2} y={height - 1} textAnchor="middle" className="chart-axis-title">LP Mode</text>
      </svg>
    </div>
  </div>;
}

function SingleBarChart({ title, rows, getValue, yMax, yLabel, colorClass, centerZero }: {
  title: string;
  rows: ErrorRow[];
  getValue: (row: ErrorRow) => number;
  yMax: number;
  yLabel: string;
  colorClass: string;
  centerZero?: boolean;
}) {
  const count = rows.length;
  const plotWidth = Math.max(200, count * 18);
  const step = plotWidth / Math.max(1, count);
  const height = 190;
  const chartHeight = 148;
  const padTop = 14;
  const padLeft = 42;
  const padRight = 8;
  const width = plotWidth + padLeft + padRight;
  const baseline = padTop + (centerZero ? chartHeight / 2 : chartHeight);
  const plotBottom = padTop + chartHeight;
  const scale = chartHeight / (centerZero ? 2 * yMax : yMax);
  const barWidth = Math.min(14, Math.max(4, step * 0.4));
  const ticks = centerZero
    ? [-yMax, -yMax / 2, 0, yMax / 2, yMax]
    : [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  return <div className="chart-block">
    <h4>{title}</h4>
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${width} ${height}`} className="analysis-chart" role="img" aria-label={title}>
        <g transform={`translate(${padLeft},0)`}>
          {ticks.map((tick) => {
            const y = baseline - tick * scale;
            return <g key={tick}>
              <line x1={0} x2={count * step} y1={y} y2={y} className="chart-grid-line"/>
              <text x={-8} y={y + 4} textAnchor="end" className="chart-axis-tick">{tick.toFixed(2)}</text>
            </g>;
          })}
          <line x1={0} x2={plotWidth} y1={plotBottom} y2={plotBottom} className="chart-axis"/>
          {centerZero ? <line x1={0} x2={plotWidth} y1={baseline} y2={baseline} className="chart-zero-axis"/> : null}
          {rows.map((row, index) => {
            const value = getValue(row);
            const heightValue = Math.abs(value) * scale;
            const y = value >= 0 ? baseline - heightValue : baseline;
            return <rect key={row.label} x={index * step + step / 2 - barWidth / 2} y={y} width={barWidth} height={Math.max(0.4, heightValue)} className={colorClass}/>;
          })}
          <ModeTicks labels={rows.map((row) => row.label)} step={step} axisY={plotBottom}/>
        </g>
        <text x={padLeft - 30} y={height / 2} transform={`rotate(-90 ${padLeft - 30} ${height / 2})`} textAnchor="middle" className="chart-axis-label">{yLabel}</text>
        <text x={padLeft + plotWidth / 2} y={height - 1} textAnchor="middle" className="chart-axis-title">LP Mode</text>
      </svg>
    </div>
  </div>;
}

export default function PredictionPanel({ prediction, busy }: {
  prediction: PredictionPayload | null;
  busy: boolean;
}) {
  const nearTrueRef = useRef<HTMLCanvasElement>(null);
  const nearPredRef = useRef<HTMLCanvasElement>(null);
  const nearResidualRef = useRef<HTMLCanvasElement>(null);
  const farTrueRef = useRef<HTMLCanvasElement>(null);
  const farPredRef = useRef<HTMLCanvasElement>(null);
  const farResidualRef = useRef<HTMLCanvasElement>(null);
  const phaseTrueRef = useRef<HTMLCanvasElement>(null);
  const phasePredRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!prediction) return;
    const images = prediction.images;
    const size = images.size;
    drawJetIntensity(nearTrueRef.current, images.nearTrue, size);
    drawJetIntensity(nearPredRef.current, images.nearPred, size);
    drawJet(nearResidualRef.current, images.nearResidual, size);
    drawJetIntensity(farTrueRef.current, images.farTrue, size);
    drawJetIntensity(farPredRef.current, images.farPred, size);
    drawJet(farResidualRef.current, images.farResidual, size);
    drawPhase(phaseTrueRef.current, images.phaseTrue, images.phaseMask, size);
    drawPhase(phasePredRef.current, images.phasePred, images.phaseMask, size);
  }, [prediction]);

  if (!busy && !prediction) return null;

  const rows = prediction?.rows ?? [];
  const metrics = prediction?.metrics;
  const maxWeight = Math.max(1e-6, ...rows.map((row) => Math.max(row.trueWeight, row.predWeight)));
  const maxPhase = Math.max(1e-6, ...rows.map((row) => Math.max(Math.abs(row.truePhase), Math.abs(row.predPhase))));
  const maxPhaseError = Math.max(1e-6, ...rows.map((row) => Math.abs(row.phaseError)));

  function downloadJson() {
    if (!prediction) return;
    const payload = {
      model: prediction.model,
      modeCount: prediction.modeCount,
      coefficients: prediction.coefficients,
      rows: prediction.rows,
      metrics: prediction.metrics,
      norm: prediction.norm,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.download = `prediction_${prediction.model.name.replace(/[\\/]/g, "_").replace(/\.(pth|pt|ckpt)$/i, "")}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <section className="prediction-flow panel" aria-labelledby="prediction-title">
      <header className="settings-header">
        <div>
          <p className="section-kicker">MODAL DECOMPOSITION · PREDICT + ANALYZE</p>
          <h2 id="prediction-title">模态系数预测与误差分析</h2>
          <p>{prediction ? `模型 ${prediction.model.name} · ${prediction.model.numModes} 个模式 · ${prediction.model.backbone} · ${prediction.model.device} · 推理 ${(prediction.model.elapsedMs / 1000).toFixed(2)}s` : "正在准备分析结果…"}</p>
        </div>
      </header>

      {busy && <div className="prediction-busy"><span className="agent-spark">✦</span> 正在加载模型并预测模态系数…</div>}
      {!busy && prediction && <>
        <div className="metric-strip">
          <div className="metric-card"><span>近场 Pearson r</span><strong>{(metrics?.nearPearson ?? 0).toFixed(4)}</strong></div>
          <div className="metric-card"><span>近场 SSIM</span><strong>{(metrics?.nearSsim ?? 0).toFixed(4)}</strong></div>
          <div className="metric-card"><span>远场 Pearson r</span><strong>{(metrics?.farPearson ?? 0).toFixed(4)}</strong></div>
          <div className="metric-card"><span>远场 SSIM</span><strong>{(metrics?.farSsim ?? 0).toFixed(4)}</strong></div>
          <div className="metric-card"><span>权重 MSE</span><strong>{(metrics?.weightMse ?? 0).toFixed(6)}</strong></div>
          <div className="metric-card"><span>相位 MAE (rad)</span><strong>{(metrics?.phaseMae ?? 0).toFixed(4)}</strong></div>
        </div>
        <div className="metric-note">近/远场平均绝对残差：{(metrics?.meanAbsResidualNear ?? 0).toFixed(4)} / {(metrics?.meanAbsResidualFar ?? 0).toFixed(4)} · 真值 ||w|| = {prediction.norm.trueNorm.toFixed(4)} · 预测 ||w|| = {prediction.norm.predNorm.toFixed(4)}</div>

        <section className="analysis-section">
          <h3>预测模态系数（真值 vs 模型输出）</h3>
          <div className="table-scroll">
            <table className="coefficient-table">
              <thead><tr><th>模式</th><th>真值权重 w</th><th>预测权重 ŵ</th><th>真值相对相位 φ</th><th>预测相对相位 φ̂</th></tr></thead>
              <tbody>
                {prediction.coefficients.map((row) => <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.trueWeight.toFixed(4)}</td>
                  <td>{row.predWeight.toFixed(4)}</td>
                  <td>{row.truePhase.toFixed(4)}</td>
                  <td>{row.predPhase.toFixed(4)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <section className="analysis-section">
          <h3>残差分析（近场 / 远场：真值 · 重构 · 残差）</h3>
          <div className="analysis-image-grid">
            <ImageCard title="近场 True" canvasRef={nearTrueRef}/>
            <ImageCard title="近场 Reco." sub={`r = ${(metrics?.nearPearson ?? 0).toFixed(3)}, SSIM = ${(metrics?.nearSsim ?? 0).toFixed(3)}`} canvasRef={nearPredRef}/>
            <ImageCard title="近场 Resi." canvasRef={nearResidualRef}/>
            <ImageCard title="远场 True" canvasRef={farTrueRef}/>
            <ImageCard title="远场 Reco." sub={`r = ${(metrics?.farPearson ?? 0).toFixed(3)}, SSIM = ${(metrics?.farSsim ?? 0).toFixed(3)}`} canvasRef={farPredRef}/>
            <ImageCard title="远场 Resi." canvasRef={farResidualRef}/>
          </div>
        </section>

        <section className="analysis-section">
          <h3>相位图分析（强度 ≥ 1% 处显示，HSV 色相编码）</h3>
          <div className="analysis-image-grid phase-grid">
            <ImageCard title="相位 True" canvasRef={phaseTrueRef}/>
            <ImageCard title="相位 Reco." canvasRef={phasePredRef}/>
          </div>
        </section>

        <section className="analysis-section">
          <h3>柱状图分析</h3>
          <div className="chart-grid">
            <GroupedBarChart title="模式权重 (i) True vs Pred" rows={rows} getTrue={(row) => row.trueWeight} getPred={(row) => row.predWeight} yMax={maxWeight * 1.22} yLabel="Weight" legend/>
            <GroupedBarChart title="模式相对相位 (j) True vs Pred" rows={rows} getTrue={(row) => row.truePhase} getPred={(row) => row.predPhase} yMax={Math.max(Math.PI, maxPhase) * 1.1} yLabel="Phase (rad)" centerZero/>
            <SingleBarChart title="模式相位误差 (k)" rows={rows} getValue={(row) => row.phaseError} yMax={Math.max(0.1, maxPhaseError) * 1.15} yLabel="Error (rad)" colorClass="chart-bar-error" centerZero/>
          </div>
        </section>

        <section className="analysis-section">
          <h3>各模态系数误差三线表</h3>
          <div className="table-scroll three-line-scroll">
            <table className="three-line-table">
              <thead><tr><th>模式</th><th>真值权重</th><th>预测权重</th><th>权重绝对误差</th><th>权重相对误差 (%)</th><th>真值相位 (rad)</th><th>预测相位 (rad)</th><th>相位误差 (rad)</th></tr></thead>
              <tbody>
                {prediction.rows.map((row) => <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.trueWeight.toFixed(4)}</td>
                  <td>{row.predWeight.toFixed(4)}</td>
                  <td>{row.weightAbsError.toFixed(4)}</td>
                  <td>{row.weightRelErrorPercent.toFixed(3)}</td>
                  <td>{row.truePhase.toFixed(4)}</td>
                  <td>{row.predPhase.toFixed(4)}</td>
                  <td>{row.phaseError.toFixed(4)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </>}

      <footer className="settings-footer">
        <span className="agent-footnote">残差、柱状图、相位图、Pearson、SSIM 与三线表均基于当前仿真光斑与模型预测系数计算。</span>
        <div className="prediction-actions">
          <button type="button" className="secondary-button" onClick={downloadJson} disabled={!prediction}>下载分析 JSON</button>
        </div>
      </footer>
  </section>;
}
