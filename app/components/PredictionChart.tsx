"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ErrorRow } from "../services/predictionApi";
import { ErrorSymbol, ModeLabel, readableModeLabel, Variable } from "./MathNotation";

type ChartKind = "weight" | "phase" | "phaseError";
type Hover = { row: ErrorRow; x: number; y: number; source: "pointer" | "focus" };

function ChartTooltip({ hover, kind, id }: { hover: Hover; kind: ChartKind; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const phase = kind !== "weight";
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(hover.x + 14, window.innerWidth - rect.width - 8));
    const desiredTop = hover.y + rect.height + 22 < window.innerHeight ? hover.y + 16 : hover.y - rect.height - 16;
    setPosition({ left, top: Math.max(8, Math.min(desiredTop, window.innerHeight - rect.height - 8)), visibility: "visible" });
  }, [hover.x, hover.y, hover.row, kind]);
  const trueValue = phase ? hover.row.truePhase : hover.row.trueWeight;
  const predValue = phase ? hover.row.predPhase : hover.row.predWeight;
  const error = phase ? Math.abs(hover.row.phaseError) : hover.row.weightAbsError;
  const unit = phase ? " 弧度" : "";
  return createPortal(<div ref={ref} id={id} role="tooltip" className="prediction-chart-tooltip" style={position}>
    <strong><ModeLabel label={hover.row.label}/></strong>
    <div className="tooltip-value true"><span>真实值 <Variable name={phase ? "φ" : "w"} index="i"/></span><b>{trueValue.toFixed(4)}{unit}</b></div>
    <div className="tooltip-value pred"><span>预测值 <Variable name={phase ? "φ" : "w"} index="i" hat/></span><b>{predValue.toFixed(4)}{unit}</b></div>
    <div className="tooltip-value error"><span>绝对误差 <ErrorSymbol phase={phase} absolute/></span><b>{error.toFixed(4)}{unit}</b></div>
    {phase && <div className="tooltip-value"><span>带符号相位误差</span><b>{hover.row.phaseError.toFixed(4)} 弧度</b></div>}
    {phase && <small>误差按 2π 周期折回；首模态为相位参考。</small>}
  </div>, document.body);
}

export default function PredictionChart({ rows, kind }: { rows: ErrorRow[]; kind: ChartKind }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const tooltipId = useId();
  const phase = kind !== "weight";
  const single = kind === "phaseError";
  const title = single ? "各模态相位误差" : phase ? "模式相对相位" : "模式幅度权重";
  const chartRef = useRef<SVGSVGElement>(null);
  const step = 62;
  const plotWidth = Math.max(372, rows.length * step);
  const actualStep = plotWidth / Math.max(1, rows.length);
  const left = 62;
  const top = 22;
  const plotHeight = 188;
  const width = plotWidth + left + 14;
  const height = plotHeight + top + 58;
  const getTrue = (row: ErrorRow) => phase ? row.truePhase : row.trueWeight;
  const getPred = (row: ErrorRow) => phase ? row.predPhase : row.predWeight;
  const largest = Math.max(1e-6, ...rows.map((row) => single ? Math.abs(row.phaseError) : Math.max(Math.abs(getTrue(row)), Math.abs(getPred(row)))));
  const yMax = single ? Math.max(.1, largest) * 1.15 : phase ? Math.max(Math.PI, largest) * 1.1 : largest * 1.2;
  const baseline = top + (phase ? plotHeight / 2 : plotHeight);
  const scale = plotHeight / (phase ? 2 * yMax : yMax);
  const ticks = phase ? [-yMax, -yMax / 2, 0, yMax / 2, yMax] : [0, yMax / 4, yMax / 2, yMax * .75, yMax];
  const format = (value: number) => value !== 0 && Math.abs(value) < .001 ? value.toExponential(1) : value.toFixed(3);
  const tooltipVisible = hover !== null;
  const focusedRow = hover?.source === "focus" ? hover.row : null;

  useEffect(() => {
    if (!tooltipVisible) return;
    const hide = () => setHover(null);
    const reposition = () => {
      const focused = document.activeElement;
      if (focusedRow && focused instanceof SVGElement && chartRef.current?.contains(focused)) {
        const rect = focused.getBoundingClientRect();
        setHover({ row: focusedRow, x: rect.left + rect.width / 2, y: rect.top + 26, source: "focus" });
      } else hide();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("keydown", escape);
    };
  }, [tooltipVisible, focusedRow]);

  function focusColumn(index: number) {
    const column = chartRef.current?.querySelectorAll<SVGGElement>(".chart-mode-group")[index];
    column?.focus();
  }

  return <section className="chart-block prediction-interactive-chart" aria-label={title}>
    <header className="prediction-chart-heading"><h3>{title} {single ? <ErrorSymbol phase/> : <Variable name={phase ? "φ" : "w"} index="i"/>}</h3>
      <div className="prediction-chart-legend">{single ? <span><i className="error"/>带符号误差（弧度）</span> : <><span><i className="true"/>真实值</span><span><i className="pred"/>预测值</span></>}</div>
    </header>
    <div className="chart-scroll">
      <svg ref={chartRef} viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} className="analysis-chart" role="group" aria-label={`${title}，方向键切换模式，聚焦或悬停显示数值`}>
        <g transform={`translate(${left},0)`}>
          {ticks.map((tick) => <g key={tick}><line x1={0} x2={plotWidth} y1={baseline - tick * scale} y2={baseline - tick * scale} className="chart-grid-line"/><text x={-9} y={baseline - tick * scale + 4} textAnchor="end" className="chart-axis-tick">{format(tick)}</text></g>)}
          <line x1={0} x2={plotWidth} y1={top + plotHeight} y2={top + plotHeight} className="chart-axis"/>
          {phase && <line x1={0} x2={plotWidth} y1={baseline} y2={baseline} className="chart-zero-axis"/>}
          {rows.map((row, index) => {
            const x = index * actualStep;
            const values = single ? [row.phaseError] : [getTrue(row), getPred(row)];
            return <g key={row.label} className={`chart-mode-group ${hover?.row.label === row.label ? "is-hovered" : ""}`} tabIndex={index === 0 ? 0 : -1} role="img"
              aria-label={`${readableModeLabel(row.label)}，真实值 ${getTrue(row).toFixed(4)}，预测值 ${getPred(row).toFixed(4)}，${phase ? "相位误差" : "权重绝对误差"} ${(phase ? row.phaseError : row.weightAbsError).toFixed(4)}${phase ? " 弧度" : ""}`}
              aria-describedby={hover?.row.label === row.label ? tooltipId : undefined}
              onPointerEnter={(event) => setHover({ row, x: event.clientX, y: event.clientY, source: "pointer" })}
              onPointerMove={(event) => setHover({ row, x: event.clientX, y: event.clientY, source: "pointer" })}
              onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
              onFocus={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHover({ row, x: rect.left + rect.width / 2, y: rect.top + 26, source: "focus" }); }}
              onKeyDown={(event) => {
                const target = event.key === "ArrowRight" ? Math.min(rows.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : null;
                if (target != null) { event.preventDefault(); focusColumn(target); }
              }}>
              <rect className="chart-hit-area" x={x + 2} y={top} width={actualStep - 4} height={plotHeight + 34}/>
              {values.map((value, barIndex) => <rect key={barIndex} x={x + actualStep / 2 + (single ? -10 : barIndex === 0 ? -16 : 2)} y={value >= 0 ? baseline - Math.abs(value) * scale : baseline} width={single ? 20 : 14} height={Math.abs(value) * scale} rx={2} className={single ? "chart-bar-error" : barIndex === 0 ? "chart-bar-true" : "chart-bar-pred"}/>)}
              <foreignObject x={x} y={top + plotHeight + 6} width={actualStep} height={30}><div className="chart-math-label"><ModeLabel label={row.label}/></div></foreignObject>
            </g>;
          })}
        </g>
        <text x={16} y={top + plotHeight / 2} transform={`rotate(-90 16 ${top + plotHeight / 2})`} textAnchor="middle" className="chart-axis-label">{phase ? "相位 / 弧度" : "幅度权重"}</text>
        <text x={left + plotWidth / 2} y={height - 3} textAnchor="middle" className="chart-axis-title">空间模式</text>
      </svg>
    </div>
    {hover && <ChartTooltip hover={hover} kind={kind} id={tooltipId}/>} 
  </section>;
}
