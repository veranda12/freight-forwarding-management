import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

/** Data kop perusahaan untuk cetak bukti. */
export async function proofCompany(db: PrismaClient) {
  const company = await db.companySetting.findFirst();
  const logo = company?.logoPath ? path.join(process.cwd(), "public", company.logoPath.replace(/^\/+/, "")) : null;
  return {
    name: company?.name ?? "", address: company?.address ?? null, city: company?.city ?? null, phone: company?.phone ?? null,
    // Data URI, karena react-pdf membaca path Windows sebagai URL.
    logoFile: logo && fs.existsSync(logo) ? `data:image/${logo.endsWith(".png") ? "png" : "jpeg"};base64,${fs.readFileSync(logo).toString("base64")}` : null,
  };
}

/** Baris rekening di cetakan bukti: "BCA 408 347 9828" untuk bank, nama kas untuk kas. */
export function cashAccountLine(ba: { kind: string; name: string; bankName: string | null; accountNo: string | null } | null | undefined): string | null {
  if (!ba) return null;
  if (ba.kind === "CASH" || !ba.accountNo) return ba.name;
  return `${ba.bankName ?? ba.name} ${ba.accountNo}`;
}

const UNIT = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function say(n: number): string {
  if (n < 12) return UNIT[n];
  if (n < 20) return `${say(n - 10)} belas`;
  if (n < 100) return `${say(Math.floor(n / 10))} puluh ${say(n % 10)}`;
  if (n < 200) return `seratus ${say(n - 100)}`;
  if (n < 1000) return `${say(Math.floor(n / 100))} ratus ${say(n % 100)}`;
  if (n < 2000) return `seribu ${say(n - 1000)}`;
  if (n < 1e6) return `${say(Math.floor(n / 1000))} ribu ${say(n % 1000)}`;
  if (n < 1e9) return `${say(Math.floor(n / 1e6))} juta ${say(n % 1e6)}`;
  if (n < 1e12) return `${say(Math.floor(n / 1e9))} miliar ${say(n % 1e9)}`;
  return `${say(Math.floor(n / 1e12))} triliun ${say(n % 1e12)}`;
}

/** Terbilang rupiah, misalnya 1.250.000 menjadi "Satu juta dua ratus lima puluh ribu rupiah". */
export function terbilang(amount: number): string {
  const text = say(Math.round(amount)).replace(/\s+/g, " ").trim() || "nol";
  return `${text[0].toUpperCase()}${text.slice(1)} rupiah`;
}
