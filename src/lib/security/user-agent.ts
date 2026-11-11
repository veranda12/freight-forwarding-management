/** Parser User-Agent ringan (tanpa dependensi). Hasilnya perkiraan, cukup untuk log dan pengenalan perangkat. */

export type UaInfo = { browser: string; os: string; deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown" };

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, "Edge"],
  [/\bOPR\/(\d+)/, "Opera"],
  [/\bSamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/\bFirefox\/(\d+)/, "Firefox"],
  [/\bFxiOS\/(\d+)/, "Firefox"],
  [/\bCriOS\/(\d+)/, "Chrome"],
  [/\bChrome\/(\d+)/, "Chrome"],
  [/\bVersion\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/Windows NT 10\.0/, "Windows 10/11"],
  [/Windows NT 6\.[123]/, "Windows 7/8"],
  [/Windows/, "Windows"],
  [/Android (\d+)/, "Android"],
  [/(?:iPhone|iPad|iPod).* OS (\d+)/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

export function parseUserAgent(ua: string | null | undefined): UaInfo {
  const s = (ua ?? "").slice(0, 512);
  if (!s) return { browser: "Tidak diketahui", os: "Tidak diketahui", deviceType: "unknown" };
  if (/bot|crawler|spider|curl\/|wget\/|python-requests|httpclient|postman/i.test(s)) {
    return { browser: s.split(/[\s/]/, 1)[0].slice(0, 40) || "Bot", os: "Tidak diketahui", deviceType: "bot" };
  }
  let browser = "Lainnya";
  for (const [re, name] of BROWSERS) {
    const m = re.exec(s);
    if (m) { browser = `${name} ${m[1]}`; break; }
  }
  let os = "Lainnya";
  for (const [re, name] of OSES) {
    const m = re.exec(s);
    if (m) { os = m[1] && (name === "Android" || name === "iOS") ? `${name} ${m[1]}` : name; break; }
  }
  const deviceType = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? "tablet"
    : /Mobi|iPhone|Android/.test(s) ? "mobile" : "desktop";
  return { browser, os, deviceType };
}
