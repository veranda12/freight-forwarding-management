import { isoCheckDigit } from "../../src/lib/job-containers";

/**
 * Nomor container uji yang lolos validasi ISO 6346 (digit cek dari fungsi aplikasi), supaya data uji yang ditulis
 * langsung ke DB sama dengan yang akan diterima form. `owner` = 3 huruf pemilik, `serial` = angka apa pun (6 digit
 * terakhir dipakai). Contoh: isoContainerNo("UNI", Date.now()).
 */
export function isoContainerNo(owner: string, serial: number | string): string {
  const code = `${owner.toUpperCase().slice(0, 3)}U${String(serial).replace(/\D/g, "").slice(-6).padStart(6, "0")}`;
  return code + isoCheckDigit(code);
}
