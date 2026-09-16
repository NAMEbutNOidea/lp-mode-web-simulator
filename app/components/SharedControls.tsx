"use client";

import type { ReactNode } from "react";

export function NumericField({ label, value, unit, min, max, step, onChange }: { label: ReactNode; value: number; unit: string; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="numeric-field"><span>{label}</span><div className="input-shell"><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}/><small>{unit}</small></div></label>;
}

export function StepBadge({ number, done }: { number: number; done?: boolean }) {
  return <span className={`step-badge ${done ? "done" : ""}`}>{done ? "✓" : number}</span>;
}
