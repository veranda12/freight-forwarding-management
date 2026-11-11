/** Jenis event keamanan dan severity bawaannya. Murni, aman dipakai di komponen client. */

export const EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "NEW_DEVICE_LOGIN",
  "SUSPICIOUS_LOGIN",
  "RATE_LIMIT_EXCEEDED",
  "ACCESS_DENIED",
  "SUSPECTED_SQL_INJECTION",
  "SUSPECTED_XSS",
  "SECURITY_SETTINGS_CHANGED",
] as const;
export type SecurityEventType = (typeof EVENT_TYPES)[number];

export const SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const REVIEW_STATUSES = ["NEW", "IN_REVIEW", "RESOLVED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DEFAULT_SEVERITY: Record<SecurityEventType, Severity> = {
  LOGIN_SUCCESS: "INFO",
  LOGIN_FAILED: "LOW",
  LOGOUT: "INFO",
  NEW_DEVICE_LOGIN: "MEDIUM",
  SUSPICIOUS_LOGIN: "HIGH",
  RATE_LIMIT_EXCEEDED: "MEDIUM",
  ACCESS_DENIED: "LOW",
  SUSPECTED_SQL_INJECTION: "HIGH",
  SUSPECTED_XSS: "HIGH",
  SECURITY_SETTINGS_CHANGED: "MEDIUM",
};

export const EVENT_LABELS: Record<SecurityEventType, string> = {
  LOGIN_SUCCESS: "Login berhasil",
  LOGIN_FAILED: "Login gagal",
  LOGOUT: "Logout",
  NEW_DEVICE_LOGIN: "Login perangkat baru",
  SUSPICIOUS_LOGIN: "Login mencurigakan",
  RATE_LIMIT_EXCEEDED: "Batas percobaan terlampaui",
  ACCESS_DENIED: "Akses ditolak",
  SUSPECTED_SQL_INJECTION: "Indikasi SQL injection",
  SUSPECTED_XSS: "Indikasi XSS",
  SECURITY_SETTINGS_CHANGED: "Konfigurasi keamanan diubah",
};

export const SEVERITY_LABELS: Record<Severity, string> = { INFO: "Info", LOW: "Rendah", MEDIUM: "Sedang", HIGH: "Tinggi" };
export const REVIEW_LABELS: Record<ReviewStatus, string> = { NEW: "Baru", IN_REVIEW: "Sedang diperiksa", RESOLVED: "Selesai" };

export const SEVERITY_RANK: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

/** Event yang dihitung sebagai "aktivitas mencurigakan" di ringkasan. */
export const SUSPICIOUS_TYPES: SecurityEventType[] = [
  "SUSPICIOUS_LOGIN", "NEW_DEVICE_LOGIN", "RATE_LIMIT_EXCEEDED", "SUSPECTED_SQL_INJECTION", "SUSPECTED_XSS",
];

export const isEventType = (v: unknown): v is SecurityEventType => typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
export const isSeverity = (v: unknown): v is Severity => typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
export const isReviewStatus = (v: unknown): v is ReviewStatus => typeof v === "string" && (REVIEW_STATUSES as readonly string[]).includes(v);
