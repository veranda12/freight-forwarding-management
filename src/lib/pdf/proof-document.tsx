import React from "react";
import { Document, Image, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatInTimeZone } from "date-fns-tz";
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
  box: { docNo: string; revision: string; effectiveDate: string };
  company: { name: string; address: string | null; city: string | null; phone: string | null; logoFile: string | null };
};

// Angka tanpa desimal bila bulat, seperti contoh client; nol tetap ditulis 0.
const money = (n: number) => formatNumber(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2);

const SIGNS: Record<"IN" | "OUT" | "JOURNAL", [string, string][]> = {
  OUT: [["Disetujui Oleh", "Pejabat Yang Berwenang"], ["Dicatat Oleh", "Akuntansi"], ["Dikeluarkan Oleh", "Kasir"], ["Diterima Oleh", "Penerima yang Berhak"]],
  IN: [["Disetujui Oleh", "Pejabat Yang Berwenang"], ["Dicatat Oleh", "Akuntansi"], ["Diterima Oleh", "Kasir"], ["Disetor Oleh", "Penyetor"]],
  JOURNAL: [["Dibuat Oleh", "Akuntansi"], ["Diperiksa Oleh", "Kepala Akuntansi"], ["Disetujui Oleh", "Pejabat Yang Berwenang"]],
};

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
 * Bukti kas/bank, jurnal, dan voucher dalam format formulir SOP client: kop dengan kotak Doc. No / Revision /
 * Effective Date / Page, tabel Keterangan - No Perkiraan - Debet - Kredit, dan kolom tanda tangan.
 */
export function ProofDocument({ doc }: { doc: ProofDoc }) {
  const f = formInfo(doc.form);
  const totalDebit = doc.rows.reduce((t, r) => t + r.debit, 0);
  const totalCredit = doc.rows.reduce((t, r) => t + r.credit, 0);
  const cols = { desc: INNER * 0.44, acc: INNER * 0.18, amt: INNER * 0.19 };
  const signs = SIGNS[f.flow];
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
