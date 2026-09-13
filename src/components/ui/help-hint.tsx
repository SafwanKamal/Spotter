/** A small inline "?" that reveals a short explanation on hover or focus.
 * Guidance that is useful once, but noise on every visit, belongs here
 * rather than in a standing block of page copy. */
export function HelpHint({ children }: { children: string }) {
  return (
    <span className="help-hint" tabIndex={0} role="note" aria-label={children}>
      <span aria-hidden="true">?</span>
      <span className="help-hint-bubble">{children}</span>
    </span>
  );
}
