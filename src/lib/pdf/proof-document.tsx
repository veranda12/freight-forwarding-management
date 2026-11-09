import React from "react";
import { Document, Image, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatInTimeZone } from "date-fns-tz";
import { id as idLocale } from "date-fns/locale";
import { formatNumber, TZ } from "@/lib/format";
import { formInfo, type ProofFormCode } from "@/lib/proof-forms";

const INK = "#111827";
const B = 0.8; // tebal garis

// A5 lanskap, seperti contoh formulir client. Isi panjang otomatis berlanjut ke halaman berikutnya.
const PAGE_W = 595.28;
const PAD = 22;
const INNER = PAGE_W - PAD * 2;
const LOGO_W = 92;
const META_W = 190;
const META_LABEL = 78;

const s = StyleSheet.create({
  page: { padding: PAD, fontSize: 8.5, fontFamily: "Helvetica", color: INK },
  box: { borderWidth: B, borderColor: INK },
  row: { flexDirection: "row" },
  bb: { borderBottomWidth: B, borderColor: INK },
  br: { borderRightWidth: B, borderColor: INK },
  bl: { borderLeftWidth: B, borderColor: INK },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique", fontSize: 7.5 },
  cell: { paddingVertical: 2.5, paddingHorizontal: 4 },
  logo: { width: LOGO_W - 12, height: 42, objectFit: "contain" },
  coName: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center" },
  sop: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center" },
  signTop: { textAlign: "center", fontFamily: "Helvetica-Bold", paddingVertical: 2.5 },
  signBottom: { textAlign: "center", fontFamily: "Helvetica-Bold", paddingVertical: 2.5 },
});

export type ProofRow = { description: string; account: string; debit: number; credit: number };
export type ProofDoc = {
  form: ProofFormCode;
  /** Judul pengganti (mis. "BUKTI JURNAL" untuk jurnal otomatis); bawaan = judul formulir. */
  title?: string;
  number: string;
  date: Date;
  /** Baris rekening di bawah judul, mis. "BCA 408 347 9828". Kosong = tidak ditampilkan. */
  account?: string | null;
  info: [string, string][];
  rows: ProofRow[];
  note?: string;
  /** Voucher dibatalkan: judul diberi tanda DIBATALKAN. */
  cancelled?: boolean;
  /** Kotak Doc. No / Revision / Effective Date: hanya tercetak di Jurnal Umum. */
  box: { docNo: string; revision: string; effectiveDate: string };
  company: { name: string; address: string | null; city: string | null; phone: string | null; logoFile: string | null };
};

// Angka tanpa desimal bila bulat, seperti contoh client; nol tetap ditulis 0.
const money = (n: number) => formatNumber(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);

/** Tanda tangan formulir Jurnal Umum (bukti uang masuk/keluar memakai VOUCHER_SIGNS). */
const JOURNAL_SIGNS: [string, string][] = [["Dibuat Oleh", "Akuntansi"], ["Diperiksa Oleh", "Kepala Akuntansi"], ["Disetujui Oleh", "Pejabat Yang Berwenang"]];

function MetaRow({ label, value, last, render }: { label: string; value?: string; last?: boolean; render?: boolean }) {
  return (
    <View style={[s.row, last ? {} : s.bb]}>
      <Text style={[s.cell, s.br, { width: META_LABEL }]}>{label}</Text>
      {render
        ? <Text style={[s.cell, { flex: 1 }]} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        : <Text style={[s.cell, { flex: 1 }]}>{value ?? ""}</Text>}
    </View>
  );
}

/**
 * Cetakan bukti:
 * - Uang masuk / keluar (bukti kas & bank, voucher): template Receipt / Payment Voucher client (`VoucherProof`).
 * - Jurnal Umum: format formulir SOP client, kop dengan kotak Doc. No / Revision / Effective Date / Page,
 *   tabel Keterangan - No Perkiraan - Debet - Kredit, dan kolom tanda tangan.
 */
export function ProofDocument({ doc }: { doc: ProofDoc }) {
  const f = formInfo(doc.form);
  if (f.flow !== "JOURNAL") return <VoucherProof doc={doc} flow={f.flow} />;
  const totalDebit = doc.rows.reduce((t, r) => t + r.debit, 0);
  const totalCredit = doc.rows.reduce((t, r) => t + r.credit, 0);
  const cols = { desc: INNER * 0.44, acc: INNER * 0.18, amt: INNER * 0.19 };
  const signs = JOURNAL_SIGNS;
  const head: [string, string][] = [[f.numberLabel, doc.number], ["Tanggal", formatInTimeZone(doc.date, TZ, "dd-MM-yyyy")]];
  // Info tambahan (voucher: penerima, job, B/L, ...) dua per baris supaya muat satu halaman A5.
  const pairs: [string, string][][] = [];
  for (let i = 0; i < doc.info.length; i += 2) pairs.push(doc.info.slice(i, i + 2));
  return (
    <Document title={`${doc.title ?? f.title} ${doc.number}`}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.box}>
          {/* Kop: logo | nama PT, SOP, Doc. No, Revision */}
          <View style={[s.row, s.bb]}>
            <View style={[s.br, { width: LOGO_W, alignItems: "center", justifyContent: "center", padding: 4 }]}>
              {doc.company.logoFile ? <Image src={doc.company.logoFile} style={s.logo} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <View style={[s.bb, s.cell, { paddingVertical: 4 }]}><Text style={s.coName}>{doc.company.name}</Text></View>
              <View style={s.row}>
                <View style={[s.br, { flex: 1, justifyContent: "center" }]}><Text style={s.sop}>Standard Operating Procedure</Text></View>
                <View style={{ width: META_W }}>
                  <MetaRow label="Doc. No" value={doc.box.docNo} />
                  <MetaRow label="Revision" value={doc.box.revision} last />
                </View>
              </View>
            </View>
          </View>
          {/* Judul | Effective Date, Page */}
          <View style={[s.row, s.bb]}>
            <View style={[s.br, { flex: 1, justifyContent: "center" }]}><Text style={s.title}>{doc.title ?? f.title}</Text></View>
            <View style={{ width: META_W }}>
              <MetaRow label="Effective Date" value={doc.box.effectiveDate} />
              <MetaRow label="Page" render last />
            </View>
          </View>
          {doc.account ? <View style={[s.bb, s.cell]}><Text style={[s.center, { fontSize: 9.5 }]}>{doc.account}</Text></View> : null}
          {head.map(([k, v]) => (
            <View key={k} style={[s.row, s.bb]}>
              <Text style={[s.cell, s.br, s.center, { width: LOGO_W + 60 }]}>{k}</Text>
              <Text style={[s.cell, { flex: 1 }]}>{v}</Text>
            </View>
          ))}
          {pairs.map((pair, i) => (
            <View key={i} style={[s.row, s.bb]}>
              {pair.map(([k, v], j) => (
                <React.Fragment key={k}>
                  <Text style={[s.cell, s.br, s.center, { width: LOGO_W + 60 }]}>{k}</Text>
                  <Text style={[s.cell, { flex: 1 }, j === 0 && pair.length === 2 ? s.br : {}]}>{v}</Text>
                </React.Fragment>
              ))}
            </View>
          ))}

          {/* Tabel */}
          <View style={[s.row, s.bb]}>
            <Text style={[s.cell, s.br, s.bold, s.center, { width: cols.desc }]}>Keterangan</Text>
            <Text style={[s.cell, s.br, s.bold, s.center, { width: cols.acc }]}>No Perkiraan</Text>
            <Text style={[s.cell, s.br, s.bold, s.center, { width: cols.amt }]}>Debet</Text>
            <Text style={[s.cell, s.bold, s.center, { flex: 1 }]}>Kredit</Text>
          </View>
          {doc.rows.map((r, i) => (
            <View key={i} style={[s.row, s.bb]} wrap={false}>
              <Text style={[s.cell, s.br, { width: cols.desc }]}>{r.description}</Text>
              <Text style={[s.cell, s.br, { width: cols.acc }]}>{r.account}</Text>
              <Text style={[s.cell, s.br, s.right, { width: cols.amt }]}>{money(r.debit)}</Text>
              <Text style={[s.cell, s.right, { flex: 1 }]}>{money(r.credit)}</Text>
            </View>
          ))}
          <View style={[s.row, s.bb]} wrap={false}>
            <Text style={[s.cell, s.br, s.italic, { width: cols.desc }]}>{doc.note ?? "Harap Lampirkan Bukti Pembayaran/Pendukung"}</Text>
            <Text style={[s.cell, s.br, { width: cols.acc }]}>Total</Text>
            <Text style={[s.cell, s.br, s.right, { width: cols.amt }]}>{money(totalDebit)}</Text>
            <Text style={[s.cell, s.right, { flex: 1 }]}>{money(totalCredit)}</Text>
          </View>
          <View style={[s.bb, { height: doc.info.length > 2 ? 14 : 34 }]} />

          {/* Tanda tangan */}
          <View style={s.row} wrap={false}>
            {signs.map(([top, bottom], i) => (
              <View key={top} style={[{ flex: 1 }, i < signs.length - 1 ? s.br : {}]}>
                <Text style={[s.signTop, s.bb]}>{top}</Text>
                <View style={[s.bb, { height: 48 }]} />
                <Text style={s.signBottom}>{bottom}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------- template Receipt / Payment Voucher

const BLUE = "#1d4ed8";
const RED = "#b91c1c";

const v = StyleSheet.create({
  page: { padding: PAD, fontSize: 9, fontFamily: "Helvetica", color: INK },
  head: { flexDirection: "row", alignItems: "center", paddingBottom: 6, borderBottomWidth: 1.5, borderColor: BLUE },
  logo: { width: 54, height: 44, objectFit: "contain", marginRight: 8 },
  coName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: BLUE },
  coSub: { fontSize: 8, fontFamily: "Helvetica-Oblique", color: BLUE, marginTop: 2 },
  titleBox: { borderWidth: 1, borderColor: BLUE, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 12, alignItems: "center" },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BLUE },
  subtitle: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: BLUE, marginTop: 1 },
  cancelled: { fontSize: 9, fontFamily: "Helvetica-Bold", color: RED, marginTop: 2 },
  meta: { flexDirection: "row", marginTop: 3 },
  metaLabel: { width: 112 },
  colon: { width: 10 },
  bankBox: { borderWidth: B, borderColor: INK, marginTop: 6, paddingVertical: 3, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10 },
  table: { borderWidth: B, borderColor: INK, marginTop: 6 },
  th: { fontFamily: "Helvetica-Bold", textAlign: "center", paddingVertical: 3, paddingHorizontal: 4 },
  td: { paddingVertical: 2.5, paddingHorizontal: 4 },
  signs: { flexDirection: "row", marginTop: 12, justifyContent: "space-between" },
  sign: { borderWidth: B, borderColor: INK, width: (INNER - 3 * 8) / 4 },
  signTop: { textAlign: "center", paddingVertical: 2.5, borderBottomWidth: B, borderColor: INK },
  signBottom: { textAlign: "center", fontFamily: "Helvetica-Bold", paddingVertical: 2.5 },
});

/** Tanda tangan sama untuk Receipt dan Payment Voucher (keputusan 2026-11-09). */
const VOUCHER_SIGNS: [string, string][] = [
  ["Diajukan oleh,", "Operasional"], ["Diketahui oleh,", "Manager Ops"], ["Disetujui oleh,", "Direktur"], ["Diterima oleh,", "Finance"],
];

const dashMoney = (n: number) => (Math.abs(n) < 0.005 ? "-" : money(n));

/**
 * Template voucher client: kop logo + nama PT dan kotak RECEIPT / PAYMENT VOUCHER, No. Voucher dan tanggal,
 * baris rekening, tabel Keterangan - Kode COA - Debit - Kredit dengan Total, lalu empat kotak tanda tangan.
 * Nomor tetap nomor bukti SLG (BM/BK/KM/KK/VC).
 */
function VoucherProof({ doc, flow }: { doc: ProofDoc; flow: "IN" | "OUT" }) {
  const isIn = flow === "IN";
  const title = isIn ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER";
  const totalDebit = doc.rows.reduce((t, r) => t + r.debit, 0);
  const totalCredit = doc.rows.reduce((t, r) => t + r.credit, 0);
  const cols = { desc: INNER * 0.4, acc: INNER * 0.18, amt: INNER * 0.21 };
  const address = [doc.company.address, doc.company.city].filter(Boolean).join(", ");
  const meta: [string, string][] = [
    ["No. Voucher", doc.number],
    [isIn ? "Tanggal Penerimaan" : "Tanggal Pembayaran", formatInTimeZone(doc.date, TZ, "dd MMMM yyyy", { locale: idLocale })],
    ...doc.info,
  ];
  return (
    <Document title={`${title} ${doc.number}`}>
      <Page size="A5" orientation="landscape" style={v.page}>
        <View style={v.head}>
          {doc.company.logoFile ? <Image src={doc.company.logoFile} style={v.logo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={v.coName}>{doc.company.name}</Text>
            {address ? <Text style={v.coSub}>{address}</Text> : null}
          </View>
          <View style={v.titleBox}>
            <Text style={v.title}>{title}</Text>
            <Text style={v.subtitle}>{isIn ? "(Voucher Penerimaan)" : "(Voucher Pengeluaran)"}</Text>
            {doc.cancelled ? <Text style={v.cancelled}>DIBATALKAN</Text> : null}
          </View>
        </View>

        <View style={{ marginTop: 6 }}>
          {meta.map(([k, val], i) => (
            <View key={`${k}-${i}`} style={v.meta}>
              <Text style={v.metaLabel}>{k}</Text>
              <Text style={v.colon}>:</Text>
              <Text style={[{ flex: 1 }, i === 0 ? s.bold : {}]}>{val}</Text>
            </View>
          ))}
        </View>

        {doc.account ? <Text style={v.bankBox}>{doc.account}</Text> : null}

        <View style={v.table}>
          <View style={[s.row, s.bb]} fixed>
            <Text style={[v.th, s.br, { width: cols.desc }]}>Keterangan</Text>
            <Text style={[v.th, s.br, { width: cols.acc }]}>Kode COA</Text>
            <Text style={[v.th, s.br, { width: cols.amt }]}>Debit (Rp)</Text>
            <Text style={[v.th, { flex: 1 }]}>Kredit (Rp)</Text>
          </View>
          {doc.rows.map((r, i) => (
            <View key={i} style={[s.row, s.bb]} wrap={false}>
              <Text style={[v.td, s.br, { width: cols.desc }]}>{r.description}</Text>
              <Text style={[v.td, s.br, s.center, { width: cols.acc }]}>{r.account || "-"}</Text>
              <Text style={[v.td, s.br, s.right, { width: cols.amt }]}>{dashMoney(r.debit)}</Text>
              <Text style={[v.td, s.right, { flex: 1 }]}>{dashMoney(r.credit)}</Text>
            </View>
          ))}
          <View style={s.row} wrap={false}>
            <Text style={[v.td, s.br, s.bold, s.center, { width: cols.desc + cols.acc }]}>Total</Text>
            <Text style={[v.td, s.br, s.bold, s.right, { width: cols.amt }]}>{money(totalDebit)}</Text>
            <Text style={[v.td, s.bold, s.right, { flex: 1 }]}>{money(totalCredit)}</Text>
          </View>
        </View>

        <View style={v.signs} wrap={false}>
          {VOUCHER_SIGNS.map(([top, bottom]) => (
            <View key={top} style={v.sign}>
              <Text style={v.signTop}>{top}</Text>
              <View style={{ height: 40 }} />
              <Text style={v.signBottom}>{bottom}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
