import type { ReactNode } from "react";

export function MathInline({ children, label }: { children: ReactNode; label?: string }) {
  return <math className="math-inline" aria-label={label}>{children}</math>;
}

export function Variable({ name, index, hat = false, normal = false }: { name: string; index?: string; hat?: boolean; normal?: boolean }) {
  const base = <mi mathvariant={normal ? "normal" : "italic"}>{name}</mi>;
  const symbol = hat ? <mover accent="true">{base}<mo>^</mo></mover> : base;
  return <MathInline>{index ? <msub>{symbol}<mi>{index}</mi></msub> : symbol}</MathInline>;
}

function parityName(value?: string) {
  const normalized = value?.toLowerCase();
  if (normalized === "e" || normalized === "even") return "even";
  if (normalized === "o" || normalized === "odd") return "odd";
  return value ?? "";
}

export function readableModeLabel(label: string) {
  const parsed = label.match(/^LP(\d{2,})(even|odd|[eoab])?$/i);
  if (!parsed) return label;
  const variant = parityName(parsed[2]);
  return `LP ${parsed[1]}${variant ? ` ${variant}` : ""}`;
}

export function ModeLabel({ label, l, m, parity }: { label?: string; l?: number; m?: number; parity?: string }) {
  // Backend identifiers remain untouched. Without explicit orders, retain the
  // entire numeric subscript rather than guessing where multi-digit l/m split.
  const parsed = label?.match(/^LP(\d{2,})(even|odd|[eoab])?$/i);
  if (l == null && !parsed) return <span>{label}</span>;
  const variant = l === 0 ? "" : parityName(parity ?? parsed?.[2]);
  const order = l != null && m != null ? (l > 9 || m > 9 ? `${l},${m}` : `${l}${m}`) : parsed![1];
  return <MathInline label={l != null ? `LP ${l},${m}${variant ? ` ${variant}` : ""}` : readableModeLabel(label!)}>
    {variant ? <msubsup><mi mathvariant="normal">LP</mi><mn>{order}</mn><mi mathvariant="normal">{variant}</mi></msubsup>
      : <msub><mi mathvariant="normal">LP</mi><mn>{order}</mn></msub>}
  </MathInline>;
}

export function ErrorSymbol({ phase = false, absolute = false }: { phase?: boolean; absolute?: boolean }) {
  return <MathInline label={phase ? "相位误差" : "权重绝对误差"}>
    {phase ? <mrow>{absolute && <mo>|</mo>}<mi mathvariant="normal">Δ</mi><msub><mi>φ</mi><mi>i</mi></msub>{absolute && <mo>|</mo>}</mrow>
      : <mrow><mo>|</mo><msub><mover accent="true"><mi>w</mi><mo>^</mo></mover><mi>i</mi></msub><mo>−</mo><msub><mi>w</mi><mi>i</mi></msub><mo>|</mo></mrow>}
  </MathInline>;
}
