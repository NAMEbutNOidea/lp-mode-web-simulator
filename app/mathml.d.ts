import type { AriaAttributes, CSSProperties, DOMAttributes } from "react";

// The installed React typings omit native MathML elements supported by the browser.
// Limit the augmentation to the tags and attributes used by the formula panel.
type MathMLProps = AriaAttributes & DOMAttributes<MathMLElement> & {
  id?: string;
  className?: string;
  style?: CSSProperties;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps & { display?: "block" | "inline" };
      mrow: MathMLProps;
      mi: MathMLProps & { mathvariant?: "normal" | "italic" };
      mo: MathMLProps & { stretchy?: "true" | "false"; largeop?: "true" | "false" };
      mn: MathMLProps;
      msub: MathMLProps;
      msup: MathMLProps;
      msubsup: MathMLProps;
      mfrac: MathMLProps;
      msqrt: MathMLProps;
      mspace: MathMLProps & { width?: string };
    }
  }
}
