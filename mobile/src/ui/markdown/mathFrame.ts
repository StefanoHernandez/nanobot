/** Fixed height estimate. Tall constructs get extra room per line. */
export function heightFor(tex: string): number {
  const tall = /\\(frac|dfrac|sum|int|prod|lim|begin|sqrt)/.test(tex) ? 72 : 48;
  return Math.max(56, tall * tex.split("\\\\").length);
}

/** Empty sandbox: no scripts, and not the page's origin, so the formula cannot read the secret. */
export function mathFrameProps(html: string, tex: string): { sandbox: ""; srcDoc: string; height: number } {
  return { sandbox: "", srcDoc: html, height: heightFor(tex) };
}
