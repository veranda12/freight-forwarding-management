import { LOGO_COLOR, LOGO_SHAPE } from "@/lib/brand-logo";

/** Logo PT Sentra Logistik Global untuk tampilan web. `color="currentColor"` mengikuti warna teks (mis. panel gelap). */
export function LogoMark({ className, color = LOGO_COLOR, title }: { className?: string; color?: string; title?: string }) {
  const s = LOGO_SHAPE;
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx={s.ring.cx} cy={s.ring.cy} r={s.ring.r} fill="none" stroke={color} strokeWidth={s.ring.width} />
      {s.arms.map((p) => <polygon key={p} points={p} fill={color} />)}
      {s.nodes.map((n) => <circle key={`${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={n.r} fill={color} />)}
      <circle cx={s.hub.cx} cy={s.hub.cy} r={s.hub.r} fill={color} />
    </svg>
  );
}
