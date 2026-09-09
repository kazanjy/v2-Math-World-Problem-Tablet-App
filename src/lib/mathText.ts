// Convert the LaTeX math notation the model sometimes emits into plain,
// readable text (e.g. "\(\tfrac{3}{4}\)" -> "3/4"), so questions, answers, and
// explanations render correctly instead of showing raw markup.
// Pure (no browser/Node dependencies) so it can run on both client and server.
export function formatMathText(input: string): string {
  if (!input) return input;
  let s = input;

  // Fractions: \frac{a}{b}, \tfrac{a}{b}, \dfrac{a}{b} -> a/b
  s = s.replace(/\\(?:t|d)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');

  // Common math operators / symbols
  s = s
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$');

  // Strip math delimiters: \( \) \[ \] and $ ... $
  s = s.replace(/\\[()[\]]/g, '');
  s = s.replace(/\$/g, '');

  // Collapse spacing macros (\, \; \: \!) and extra whitespace
  s = s.replace(/\\[,;:!]/g, ' ');
  s = s.replace(/[ \t]{2,}/g, ' ').trim();

  return s;
}
