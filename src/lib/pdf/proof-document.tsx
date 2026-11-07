import React from "react";
import { Document, Image, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatNumber } from "@/lib/format";

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: INK },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottom: 1, borderColor: INK, paddingBottom: 8, marginBottom: 12 },
  brand: { flexDirection: "row", gap: 8, alignItems: "center" },
  logo: { width: 40, height: 40, objectFit: "contain" },
  coName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  coMeta: { fontSize: 8, color: MUTED, marginTop: 1 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  number: { fontSize: 10, textAlign: "right", marginTop: 3 },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 90, color: MUTED },
  infoValue: { flex: 1 },
  table: { marginTop: 10, border: 1, borderColor: LINE },
  th: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: 1, borderColor: LINE },
  tr: { flexDirection: "row", borderBottom: 1, borderColor: LINE },
  cell: { padding: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  words: { marginTop: 8, fontSize: 8.5 },
  note: { marginTop: 4, fontSize: 8, color: MUTED },
  signs: { flexDirection: "row", marginTop: 26, gap: 10 },
  sign: { flex: 1, alignItems: "center" },
  signLine: { marginTop: 48, borderTop: 1, borderColor: MUTED, width: "100%" },
});

export type ProofRow = { account: string; description: string; debit: number; credit: number };
export type ProofDoc = {
  title: string; number: string; date: Date; info: [string, string][]; rows: ProofRow[];
  showBothSides: boolean; words: string; note: string; signatures: string[];
  company: { name: string; address: string | null; city: string | null; phone: string | null; logoFile: string | null };
};

const money = (n: number) => (n ? formatNumber(n, 2) : "-");

/** Bukti kas dan bank, Jurnal Umum, dan voucher pengeluaran memakai satu format cetak. */
export function ProofDocument({ doc }: { doc: ProofDoc }) {
  const totalDebit = doc.rows.reduce((t, r) => t + r.debit, 0);
  const totalCredit = doc.rows.reduce((t, r) => t + r.credit, 0);
  const cols = doc.showBothSides ? [0.24, 0.4, 0.18, 0.18] : [0.3, 0.48, 0.22];
  return (
    <Document title={`${doc.title} ${doc.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={s.brand}>
            {doc.company.logoFile ? <Image src={doc.company.logoFile} style={s.logo} /> : null}
            <View>
              <Text style={s.coName}>{doc.company.name}</Text>
              <Text style={s.coMeta}>{[doc.company.address, doc.company.city].filter(Boolean).join(", ")}</Text>
              {doc.company.phone ? <Text style={s.coMeta}>{doc.company.phone}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={s.title}>{doc.title}</Text>
            <Text style={s.number}>{doc.number}</Text>
            <Text style={[s.coMeta, s.right]}>{formatDate(doc.date)}</Text>
          </View>
        </View>

        {doc.info.map(([k, v]) => (
          <View key={k} style={s.infoRow}><Text style={s.infoLabel}>{k}</Text><Text style={s.infoValue}>{v}</Text></View>
        ))}

        <View style={s.table}>
          <View style={s.th}>
            <Text style={[s.cell, s.bold, { width: `${cols[0] * 100}%` }]}>No. Perkiraan</Text>
            <Text style={[s.cell, s.bold, { width: `${cols[1] * 100}%` }]}>Keterangan</Text>
            {doc.showBothSides ? (
              <>
                <Text style={[s.cell, s.bold, s.right, { width: `${cols[2] * 100}%` }]}>Debet</Text>
                <Text style={[s.cell, s.bold, s.right, { width: `${cols[3] * 100}%` }]}>Kredit</Text>
              </>
            ) : <Text style={[s.cell, s.bold, s.right, { width: `${cols[2] * 100}%` }]}>Jumlah</Text>}
          </View>
          {doc.rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={[s.cell, { width: `${cols[0] * 100}%` }]}>{r.account}</Text>
              <Text style={[s.cell, { width: `${cols[1] * 100}%` }]}>{r.description}</Text>
              {doc.showBothSides ? (
                <>
                  <Text style={[s.cell, s.right, { width: `${cols[2] * 100}%` }]}>{money(r.debit)}</Text>
                  <Text style={[s.cell, s.right, { width: `${cols[3] * 100}%` }]}>{money(r.credit)}</Text>
                </>
              ) : <Text style={[s.cell, s.right, { width: `${cols[2] * 100}%` }]}>{money(r.debit || r.credit)}</Text>}
            </View>
          ))}
          <View style={{ flexDirection: "row" }}>
            <Text style={[s.cell, s.bold, s.right, { width: `${(cols[0] + cols[1]) * 100}%` }]}>Total</Text>
            {doc.showBothSides ? (
              <>
                <Text style={[s.cell, s.bold, s.right, { width: `${cols[2] * 100}%` }]}>{money(totalDebit)}</Text>
                <Text style={[s.cell, s.bold, s.right, { width: `${cols[3] * 100}%` }]}>{money(totalCredit)}</Text>
              </>
            ) : <Text style={[s.cell, s.bold, s.right, { width: `${cols[2] * 100}%` }]}>{money(totalDebit || totalCredit)}</Text>}
          </View>
        </View>

        <Text style={s.words}>Terbilang: {doc.words}</Text>
        <Text style={s.note}>{doc.note}</Text>

        <View style={s.signs} wrap={false}>
          {doc.signatures.map((t) => (
            <View key={t} style={s.sign}><Text>{t}</Text><View style={s.signLine} /></View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
