import { faker } from "@faker-js/faker/locale/id_ID";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function pick<T>(arr: T[]): T {
  return arr[faker.number.int({ min: 0, max: arr.length - 1 })];
}

export function weighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const [val, w] of entries) {
    if (roll < w) return val;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}

export function randAmount(min: number, max: number, step = 1): number {
  const n = faker.number.int({ min: Math.floor(min / step), max: Math.floor(max / step) });
  return n * step;
}

/** NPWP format: 99.999.999.9-999.999 */
export function npwp(): string {
  const d = (n: number) => faker.string.numeric(n);
  return `${d(2)}.${d(3)}.${d(3)}.${d(1)}-${d(3)}.${d(3)}`;
}

/** ISO 6346 container number: OWNER(3) + U + 6 digits + check digit */
const CHAR_VALUES: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  let value = 10;
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(65 + i);
    while (value % 11 === 0) value++;
    map[ch] = value;
    value++;
  }
  return map;
})();

export function containerNumber(ownerCode?: string): string {
  const owners = ["MSKU", "MSCU", "CMAU", "EGHU", "ONEU", "HLBU", "SUDU", "TLLU", "GESU", "TGHU"];
  const owner = ownerCode ?? pick(owners); // 4 chars incl category letter
  const serial = faker.string.numeric(6);
  const base = owner + serial; // 10 chars
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = base[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : CHAR_VALUES[ch];
    sum += val * Math.pow(2, i);
  }
  let check = sum % 11;
  if (check === 10) check = 0;
  return `${owner} ${serial} ${check}`;
}

export function blNumber(prefix: string): string {
  return `${prefix}${faker.string.alphanumeric({ length: 9, casing: "upper" })}`;
}

export function awbNumber(airlinePrefix: string): string {
  // 3-digit airline prefix + 8 digit serial
  return `${airlinePrefix}-${faker.string.numeric(8)}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}
