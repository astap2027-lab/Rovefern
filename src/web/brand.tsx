/**
 * Brand config — change the name, tagline and mark here and it updates everywhere.
 */
export const BRAND = {
  name: "Rovefern",
  tagline: "Your next adventure, organised.",
  description: "Plan hiking and backpacking trips: routes, gear, pack weight, food, water, budget and safety in one place.",
};

/** Logo mark: a fern frond growing out of contour lines. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#1f3b2c" />
      <path d="M5 22c4-2 7-2 11 0s7 2 11 0" stroke="#7d8a5c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M7 25.5c3-1.4 6-1.4 9 0s6 1.4 9 0" stroke="#7d8a5c" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M16 21V7" stroke="#e6dcc8" strokeWidth="1.6" strokeLinecap="round" />
      {[9, 12, 15, 18].map((y, i) => (
        <g key={y} stroke="#e6dcc8" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <path d={`M16 ${y}c-${2.6 - i * 0.3} -0.4 -${4.4 - i * 0.6} -1.6 -${5 - i * 0.7} -3.2`} />
          <path d={`M16 ${y}c${2.6 - i * 0.3} -0.4 ${4.4 - i * 0.6} -1.6 ${5 - i * 0.7} -3.2`} />
        </g>
      ))}
    </svg>
  );
}
