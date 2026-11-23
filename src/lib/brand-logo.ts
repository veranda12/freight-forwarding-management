/**
 * Logo PT Sentra Logistik Global (gambar ulang vektor dari kop surat client, 2026-11-23): cincin, hub di tengah, dan tiga
 * lengan berujung bulatan. Satu sumber geometri untuk web (components/brand/logo-mark.tsx), PDF (lib/pdf/logo-mark.tsx),
 * dan favicon (app/icon.svg). Koordinat dalam viewBox 0 0 100 100. Murni, tanpa React.
 */
export const LOGO_COLOR = "#133d6f";

const HUB = { x: 50, y: 51, r: 14.4 };
const NODE_R = 4.8;
/** Sudut (derajat, sumbu y ke bawah) dan panjang tiap lengan dari pusat hub. */
const ARMS: [number, number][] = [[-90, 31], [148, 28], [32, 28]];
/** Lebar lengan di pangkal (melebar halus ke hub) dan di ujung. */
const ARM_BASE = 10;
const ARM_TIP = 3.4;

export type LogoShape = {
  ring: { cx: number; cy: number; r: number; width: number };
  hub: { cx: number; cy: number; r: number };
  nodes: { cx: number; cy: number; r: number }[];
  /** Poligon lengan, sebagai string "x,y x,y ..." untuk atribut points. */
  arms: string[];
};

const f = (n: number) => Math.round(n * 100) / 100;

export const LOGO_SHAPE: LogoShape = (() => {
  const nodes: LogoShape["nodes"] = [];
  const arms: string[] = [];
  for (const [deg, len] of ARMS) {
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = -uy, py = ux;
    const nx = HUB.x + len * ux, ny = HUB.y + len * uy;
    nodes.push({ cx: f(nx), cy: f(ny), r: NODE_R });
    const pts: [number, number][] = [
      [HUB.x + (px * ARM_BASE) / 2, HUB.y + (py * ARM_BASE) / 2],
      [nx + (px * ARM_TIP) / 2, ny + (py * ARM_TIP) / 2],
      [nx - (px * ARM_TIP) / 2, ny - (py * ARM_TIP) / 2],
      [HUB.x - (px * ARM_BASE) / 2, HUB.y - (py * ARM_BASE) / 2],
    ];
    arms.push(pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" "));
  }
  return { ring: { cx: 50, cy: 50, r: 44.6, width: 6.8 }, hub: { cx: HUB.x, cy: HUB.y, r: HUB.r }, nodes, arms };
})();

/** SVG utuh (untuk favicon dan uji). */
export function logoSvg(color: string = LOGO_COLOR): string {
  const s = LOGO_SHAPE;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
    `<circle cx="${s.ring.cx}" cy="${s.ring.cy}" r="${s.ring.r}" fill="none" stroke="${color}" stroke-width="${s.ring.width}"/>`,
    ...s.arms.map((p) => `<polygon points="${p}" fill="${color}"/>`),
    ...s.nodes.map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="${color}"/>`),
    `<circle cx="${s.hub.cx}" cy="${s.hub.cy}" r="${s.hub.r}" fill="${color}"/>`,
    `</svg>`,
  ].join("");
}
