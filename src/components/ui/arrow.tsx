const DEGREES = {
  right: 0,
  down: 90,
  left: 180,
  up: -90,
} as const;

/** One arrow, rotated to the action: proceed/navigate right, jump down, etc. */
export function Arrow({
  direction = "right",
}: {
  direction?: keyof typeof DEGREES;
}) {
  return (
    <svg
      className="ui-arrow"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <g transform={`rotate(${DEGREES[direction]} 8 8)`}>
        <path
          d="M2.5 8h9.5M8.5 4.25 13.25 8 8.5 11.75"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
