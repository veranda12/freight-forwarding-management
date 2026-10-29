import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatNumber } from "@/lib/format";
import type { PdfCompany } from "./job-document";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: 2, borderColor: "#0b4a8f", paddingBottom: 8, marginBottom: 10 },
  coName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0b4a8f" },
  coMeta: { fontSize: 8, color: "#374151", marginTop: 2 },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docNo: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: 3 },
  docMeta: { fontSize: 8, textAlign: "right", color: "#374151", marginTop: 2 },
  grid2: { flexDirection: "row", gap: 8, marginBottom: 8 },
  box: { flex: 1, border: 1, borderColor: "#d1d5db", borderRadius: 3, padding: 6 },
  boxLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  boxValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  boxText: { fontSize: 8, marginTop: 1, color: "#374151" },
  route: { flexDirection: "row", gap: 8, marginBottom: 8 },
  routeCell: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 3, padding: 6 },
  table: { border: 1, borderColor: "#d1d5db", borderRadius: 3, marginTop: 4 },
  th: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: 1, borderColor: "#d1d5db", padding: 4 },
  td: { flexDirection: "row", borderBottom: 1, borderColor: "#e5e7eb", padding: 4 },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#374151" },
  summary: { flexDirection: "row", gap: 8, marginTop: 8 },
  sign: { marginTop: 28, flexDirection: "row", justifyContent: "space-between" },
  signBox: { width: 150, alignItems: "center" },
  signLine: { marginTop: 42, borderTop: 1, borderColor: "#9ca3af", width: 140, paddingTop: 3, fontSize: 8, textAlign: "center" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, borderTop: 1, borderColor: "#d1d5db", paddingTop: 6, fontSize: 7, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
});

export type PdfStt = {
  number: string; mode: string; createdAt: Date; pickupDate: Date | null; etaDate: Date | null;
  originCity: string; destCity: string;
  shipperName: string; shipperPhone: string | null; shipperAddress: string | null;
  consigneeName: string; consigneePhone: string | null; consigneeAddress: string | null;
  goodsDescription: string | null; customerName: string;
  totalKoli: number; actualWeightKg: number; volumeCbm: number; volumetricWeightKg: number; chargeableWeightKg: number; divisor: number;
  packages: { qty: number; lengthCm: number; widthCm: number; heightCm: number; weightKg: number; description: string | null }[];
  notes: string | null;
};

const COLS = [{ w: 0.08, t: "Koli" }, { w: 0.3, t: "Dimensi P×L×T (cm)" }, { w: 0.16, t: "Berat/koli" }, { w: 0.14, t: "CBM" }, { w: 0.32, t: "Keterangan" }];

/** STT — Surat Tanda Terima barang (tanpa harga; harga ada di invoice). */
export function SttDocument({ stt, company, modeLabel }: { stt: PdfStt; company: PdfCompany; modeLabel: string }) {
  return (
    <Document title={`STT ${stt.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.coName}>{company.name}</Text>
            {company.address ? <Text style={s.coMeta}>{company.address}{company.city ? `, ${company.city}` : ""}</Text> : null}
            <Text style={s.coMeta}>{[company.phone, company.email].filter(Boolean).join(" · ")}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>SURAT TANDA TERIMA</Text>
            <Text style={s.docNo}>{stt.number}</Text>
            <Text style={s.docMeta}>Tanggal: {formatDate(stt.createdAt)} · Layanan: {modeLabel}</Text>
          </View>
        </View>

        <View style={s.route}>
          <View style={s.routeCell}><Text style={s.boxLabel}>Kota asal</Text><Text style={s.boxValue}>{stt.originCity}</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Kota tujuan</Text><Text style={s.boxValue}>{stt.destCity}</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Tgl jemput</Text><Text style={s.boxValue}>{formatDate(stt.pickupDate)}</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Estimasi tiba</Text><Text style={s.boxValue}>{formatDate(stt.etaDate)}</Text></View>
        </View>

        <View style={s.grid2}>
          <View style={s.box}>
            <Text style={s.boxLabel}>Pengirim</Text>
            <Text style={s.boxValue}>{stt.shipperName}</Text>
            {stt.shipperPhone ? <Text style={s.boxText}>{stt.shipperPhone}</Text> : null}
            {stt.shipperAddress ? <Text style={s.boxText}>{stt.shipperAddress}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxLabel}>Penerima</Text>
            <Text style={s.boxValue}>{stt.consigneeName}</Text>
            {stt.consigneePhone ? <Text style={s.boxText}>{stt.consigneePhone}</Text> : null}
            {stt.consigneeAddress ? <Text style={s.boxText}>{stt.consigneeAddress}</Text> : null}
          </View>
        </View>

        <Text style={s.boxLabel}>Isi barang: {stt.goodsDescription ?? "-"}</Text>
        <View style={s.table}>
          <View style={s.th}>{COLS.map((c) => <Text key={c.t} style={[s.thText, { flex: c.w }]}>{c.t}</Text>)}</View>
          {stt.packages.map((p, i) => (
            <View key={i} style={s.td}>
              <Text style={{ flex: COLS[0].w }}>{p.qty}</Text>
              <Text style={{ flex: COLS[1].w }}>{formatNumber(p.lengthCm, 0)} × {formatNumber(p.widthCm, 0)} × {formatNumber(p.heightCm, 0)}</Text>
              <Text style={{ flex: COLS[2].w }}>{formatNumber(p.weightKg, 1)} kg</Text>
              <Text style={{ flex: COLS[3].w }}>{formatNumber((p.lengthCm * p.widthCm * p.heightCm * p.qty) / 1_000_000, 3)}</Text>
              <Text style={{ flex: COLS[4].w }}>{p.description ?? "-"}</Text>
            </View>
          ))}
        </View>

        <View style={s.summary}>
          <View style={s.routeCell}><Text style={s.boxLabel}>Total koli</Text><Text style={s.boxValue}>{stt.totalKoli}</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Berat aktual</Text><Text style={s.boxValue}>{formatNumber(stt.actualWeightKg, 2)} kg</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Volume</Text><Text style={s.boxValue}>{formatNumber(stt.volumeCbm, 3)} CBM</Text></View>
          <View style={s.routeCell}><Text style={s.boxLabel}>Berat kena biaya (÷{stt.divisor})</Text><Text style={s.boxValue}>{formatNumber(stt.chargeableWeightKg, 2)} kg</Text></View>
        </View>
        {stt.notes ? <Text style={[s.boxText, { marginTop: 6 }]}>Catatan: {stt.notes}</Text> : null}

        <View style={s.sign}>
          {["Pengirim", "Petugas", "Penerima"].map((who) => (
            <View key={who} style={s.signBox}>
              <Text style={s.boxLabel}>{who}</Text>
              <Text style={s.signLine}>Nama & tanda tangan</Text>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>{company.name} — Kargo Domestik · Customer: {stt.customerName}</Text>
          <Text>Lacak: /track/{stt.number}</Text>
        </View>
      </Page>
    </Document>
  );
}
