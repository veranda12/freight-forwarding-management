import { Circle, Image, Polygon, Svg } from "@react-pdf/renderer";
import { LOGO_COLOR, LOGO_SHAPE } from "@/lib/brand-logo";

type LogoBox = { width: number; height: number; marginRight?: number; objectFit?: string };

/**
 * Logo di kop cetakan: logo unggahan di Pengaturan bila ada, selain itu logo vektor PT Sentra Logistik Global (tajam di
 * semua ukuran). `style` = kotak logo yang sama dengan sebelumnya; logo vektor dipasang di tengah kotak.
 */
export function CompanyLogo({ file, style }: { file: string | null; style: LogoBox }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf (PDF), bukan <img> HTML; tidak punya prop alt.
  if (file) return <Image src={file} style={style} />;
  const s = LOGO_SHAPE;
  return (
    <Svg viewBox="0 0 100 100" style={{ width: style.width, height: style.height, marginRight: style.marginRight }}>
      <Circle cx={s.ring.cx} cy={s.ring.cy} r={s.ring.r} fill="none" stroke={LOGO_COLOR} strokeWidth={s.ring.width} />
      {s.arms.map((p) => <Polygon key={p} points={p} fill={LOGO_COLOR} />)}
      {s.nodes.map((n) => <Circle key={`${n.cx}-${n.cy}`} cx={n.cx} cy={n.cy} r={n.r} fill={LOGO_COLOR} />)}
      <Circle cx={s.hub.cx} cy={s.hub.cy} r={s.hub.r} fill={LOGO_COLOR} />
    </Svg>
  );
}
