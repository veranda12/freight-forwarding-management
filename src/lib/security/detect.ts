import { cleanText } from "./sanitize";

/**
 * Deteksi heuristik indikasi SQL injection dan XSS pada input teks.
 *
 * - Hasilnya "indikasi", bukan serangan terkonfirmasi. Default hanya dicatat (mode LOG_ONLY).
 * - Bukan pengganti pencegahan: semua query memakai Prisma (parameter binding) dan React meng-escape output.
 * - Kata kunci tunggal (SELECT, apostrof, "O'Brien") tidak memicu aturan; setiap aturan butuh pola struktur.
 * - Regex tanpa kuantifier bersarang dan dengan batas panjang, input dipotong MAX_INPUT karakter (aman dari ReDoS).
 */

export type FieldKind = "text" | "search" | "identifier" | "html";
export type DetectionKind = "SQLI" | "XSS";
export type Rule = { id: string; kind: DetectionKind; reason: string; re: RegExp };
export type Finding = { ruleId: string; kind: DetectionKind; field: string; reason: string; snippet: string | null };

export const MAX_INPUT = 2000;
const MAX_FIELDS = 30;

export const RULES: Rule[] = [
  { id: "sqli.tautology", kind: "SQLI", reason: "Kutip atau kurung diikuti OR/AND dengan perbandingan selalu benar (mis. ' OR 1=1)",
    re: /['")]\s{0,10}(?:or|and)\s{1,10}['"]?\w{1,20}['"]?\s{0,10}(?:=|like)\s{0,10}['"]?\w{1,20}/i },
  { id: "sqli.union_select", kind: "SQLI", reason: "UNION SELECT",
    re: /\bunion\b[\s/*]{1,20}(?:all[\s/*]{1,20})?select\b/i },
  { id: "sqli.stacked_query", kind: "SQLI", reason: "Titik koma diikuti perintah SQL perusak (DROP, DELETE FROM, ...)",
    re: /;\s{0,10}(?:drop\s{1,10}(?:table|database|schema)|truncate\s{1,10}\w|delete\s{1,10}from|insert\s{1,10}into|update\s{1,10}\w{1,64}\s{1,10}set|alter\s{1,10}table|create\s{1,10}table|exec(?:ute)?\s{1,10}\w)/i },
  { id: "sqli.quote_comment", kind: "SQLI", reason: "Kutip diikuti komentar SQL di akhir input (mis. admin'--)",
    re: /['"]\s{0,5}(?:--|#|\/\*)[^\n]{0,20}$/ },
  { id: "sqli.time_based", kind: "SQLI", reason: "Fungsi penundaan SQL (pg_sleep, SLEEP, BENCHMARK, WAITFOR DELAY)",
    re: /\b(?:pg_sleep|sleep|benchmark)\s{0,5}\(\s{0,5}\d|\bwaitfor\s{1,10}delay\s{1,10}'/i },
  { id: "sqli.schema_probe", kind: "SQLI", reason: "SELECT dari katalog sistem database",
    re: /\bselect\b[^;]{0,200}\bfrom\s{1,10}(?:information_schema|pg_catalog|pg_shadow|sqlite_master|mysql\.user)\b/i },

  { id: "xss.script_tag", kind: "XSS", reason: "Tag <script>", re: /<\s{0,5}\/?\s{0,5}script\b/i },
  { id: "xss.event_handler", kind: "XSS", reason: "Atribut event handler HTML (onerror=, onload=, ...)",
    re: /<[a-z][^>]{0,300}[\s/"']on[a-z]{3,25}\s{0,5}=/i },
  { id: "xss.js_uri", kind: "XSS", reason: "URI javascript: di atribut atau awal input",
    re: /(?:\b(?:href|src|action|formaction|xlink:href)\s{0,5}=\s{0,5}['"]?\s{0,5}|^\s{0,10})javascript\s{0,5}:/i },
  { id: "xss.dangerous_tag", kind: "XSS", reason: "Tag HTML berisiko (iframe, object, embed, svg, base, meta)",
    re: /<\s{0,5}(?:iframe|object|embed|svg|math|base|meta)\b/i },
  { id: "xss.encoded_tag", kind: "XSS", reason: "Tag HTML yang di-encode (%3Cscript, &#x3c;)",
    re: /%3c\s{0,5}\/?\s{0,5}(?:script|img|svg|iframe)|&#x?0{0,5}(?:3c|60);?\s{0,5}\/?\s{0,5}(?:script|img|svg|iframe)/i },
];

function snippet(value: string, index: number): string | null {
  const start = Math.max(0, index - 20);
  return cleanText(value.slice(start, start + 80), 80);
}

/** Periksa satu nilai. Field "html" (rich text yang memang boleh HTML) hanya dicek aturan SQL. */
export function inspectValue(field: string, value: unknown, kind: FieldKind = "text", rules: Rule[] = RULES): Finding[] {
  if (typeof value !== "string" || value.length < 4) return [];
  const v = value.slice(0, MAX_INPUT);
  const out: Finding[] = [];
  for (const r of rules) {
    if (kind === "html" && r.kind === "XSS") continue;
    const m = r.re.exec(v);
    if (m) out.push({ ruleId: r.id, kind: r.kind, field: cleanText(field, 60) ?? "-", reason: r.reason, snippet: snippet(v, m.index) });
  }
  return out;
}

/** Periksa beberapa field sekaligus (maksimal MAX_FIELDS). */
export function inspectFields(fields: Record<string, unknown>, kinds: Record<string, FieldKind> = {}): Finding[] {
  return Object.entries(fields).slice(0, MAX_FIELDS).flatMap(([k, v]) => inspectValue(k, v, kinds[k] ?? "text"));
}
