/**
 * Batas idle sesi login. Dipakai server (masa berlaku cookie sesi, diperpanjang setiap request)
 * dan browser (logout otomatis bila tidak ada aktivitas). Edge-safe: tanpa import server.
 */
export const IDLE_TIMEOUT_SEC = 10 * 60;
/** Peringatan muncul sekian detik sebelum logout otomatis. */
export const IDLE_WARNING_SEC = 60;
