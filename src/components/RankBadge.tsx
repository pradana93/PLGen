// PB-style rank badge — code-drawn SVG (no image assets, no copyrighted sprites).
// Tiers echo the classic ladder: skull → stripes → chevrons → blue diamonds →
// green commander badges → red stars → prestige (red + gold trim + pips past 51).
// Props: badge index (see badgeForLevel) + level/title for tooltip. Purely cosmetic.
export default function RankBadge({ badge, level, title, size = 18 }: {
  badge: number; level: number; title: string; size?: number;
}) {
  const b = Math.max(1, Math.min(99, badge || 1));
  const bg = b >= 47 ? "#7b1f14" : b >= 31 ? "#0e4d3c" : b >= 18 ? "#12395f" : "#1a2f4a";
  const fg = b >= 47 ? "#ffd766" : b >= 36 ? "#ffd766" : b >= 31 ? "#cfd8dc" : b >= 12 ? "#ffd766" : b >= 6 ? (b >= 8 ? "#cfd8dc" : "#d29a5b") : "#9fb3c8";

  const glyph = () => {
    if (b === 1) {
      // skull: head + eyes + jaw
      return (<g fill={fg}>
        <circle cx="12" cy="10" r="6" />
        <rect x="8" y="13" width="8" height="4" rx="1" />
        <circle cx="10" cy="10" r="1.6" fill={bg} />
        <circle cx="14" cy="10" r="1.6" fill={bg} />
      </g>);
    }
    if (b <= 5) {
      // stripes: (b-1) horizontal bars
      const n = b - 1;
      return (<g fill={fg}>{Array.from({ length: n }).map((_, i) => (
        <rect key={i} x="5" y={7 + i * 3.4} width="14" height="2.2" rx="1" />
      ))}</g>);
    }
    if (b <= 11) {
      // chevrons: (b-5) stacked V
      const n = b - 5;
      return (<g fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: n }).map((_, i) => (
          <polyline key={i} points={`6,${8 + i * 3} 12,${12 + i * 3} 18,${8 + i * 3}`} />
        ))}
      </g>);
    }
    if (b <= 17) {
      // gold chevrons: (b-11)
      const n = b - 11;
      return (<g fill="none" stroke={fg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: n }).map((_, i) => (
          <polyline key={i} points={`6,${7 + i * 2.6} 12,${11.5 + i * 2.6} 18,${7 + i * 2.6}`} />
        ))}
      </g>);
    }
    if (b <= 30) {
      // blue diamonds: 1-4 by subrange
      const n = Math.min(4, 1 + Math.floor((b - 18) * 4 / 13));
      return (<g fill={fg}>{Array.from({ length: n }).map((_, i) => {
        const cx = 12 + (i - (n - 1) / 2) * 4.6;
        return <polygon key={i} points={`${cx},6 ${cx + 2.1},12 ${cx},18 ${cx - 2.1},12`} />;
      })}</g>);
    }
    if (b <= 46) {
      // commander rosette: burst ring + center stars (1-3)
      const n = Math.min(3, 1 + Math.floor((b - 31) / 6));
      return (<g>
        <circle cx="12" cy="12" r="8" fill="none" stroke={fg} strokeWidth="1.6" strokeDasharray="2.4 1.6" />
        {Array.from({ length: n }).map((_, i) => {
          const cx = 12 + (i - (n - 1) / 2) * 5;
          return <polygon key={i} fill={fg} points={star(cx, 12, 2.6)} />;
        })}
      </g>);
    }
    // red star badges (47-51: 1-5 stars) + prestige pips past 51
    const stars = b <= 51 ? b - 46 : 5;
    const pips = b <= 51 ? 0 : Math.min(3, b - 51);
    return (<g>
      {Array.from({ length: stars }).map((_, i) => {
        const cols = stars === 1 ? [12] : stars === 2 ? [9.5, 14.5] : [8, 12, 16];
        const cx = cols[Math.min(i, cols.length - 1)];
        const cy = stars > 3 ? (i < 3 ? 9.5 : 14.5) : 12;
        const r = stars > 3 ? 2.2 : 3;
        return <polygon key={i} fill={fg} points={star(cx, cy, r)} />;
      })}
      {Array.from({ length: pips }).map((_, i) => (
        <circle key={`p${i}`} cx={8 + i * 4} cy={20.5} r={1.1} fill="#ffd766" />
      ))}
    </g>);
  };

  return (
    <span
      title={`Lv ${level} • ${title}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
        background: `linear-gradient(135deg, ${bg}, #0f1e2e)`,
        border: b > 51 ? "1px solid #ffd766" : "1px solid rgba(255,255,255,0.25)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 24 24">{glyph()}</svg>
    </span>
  );
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}
