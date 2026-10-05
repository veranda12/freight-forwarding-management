import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatNumber } from "@/lib/format";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", borderBottom: 2, borderColor: "#0b4a8f", paddingBottom: 8, marginBottom: 10 },
  coName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#0b4a8f" },
  coMeta: { fontSize: 8, color: "#374151", marginTop: 2 },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  docNo: { fontSize: 9, textAlign: "right", color: "#374151", marginTop: 2 },
  grid2: { flexDirection: "row", gap: 8, marginBottom: 8 },
  box: { flex: 1, border: 1, borderColor: "#d1d5db", borderRadius: 3, padding: 6 },
  boxLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", marginBottom: 2 },
  boxValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  boxText: { fontSize: 8, marginTop: 1, color: "#374151" },
  row: { flexDirection: "row" },
  cell: { flex: 1 },
  label: { fontSize: 7, color: "#6b7280", textTransform: "uppercase" },
  value: { fontSize: 9, marginBottom: 5 },
  section: { marginBottom: 8 },
  table: { border: 1, borderColor: "#d1d5db", borderRadius: 3, marginTop: 4 },
  th: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottom: 1, borderColor: "#d1d5db", padding: 4 },
  td: { flexDirection: "row", borderBottom: 1, borderColor: "#e5e7eb", padding: 4 },
  thText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#374151" },
  footer: { position: "absolute", bottom: 28, left: 36, right: 36, borderTop: 1, borderColor: "#d1d5db", paddingTop: 6, fontSize: 7, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
  sign: { marginTop: 24, flexDirection: "row", justifyContent: "flex-end" },
  signBox: { width: 180, alignItems: "center" },
  descBox: { border: 1, borderColor: "#d1d5db", borderRadius: 3, padding: 6, minHeight: 60, marginTop: 4 },
});

export type PdfJob = {
  number: string;
  mode: string;
  mblNo: string | null; hblNo: string | null; mawbNo: string | null; hawbNo: string | null;
  shipperName: string | null; shipperAddress: string | null;
  consigneeName: string | null; consigneeAddress: string | null;
  notifyName: string | null; notifyAddress: string | null;
  vesselName: string | null; voyageNo: string | null; flightNo: string | null;
  etd: Date | null; eta: Date | null;
  incoterm: string | null; goodsDescription: string | null;
  grossWeightKg: any; volumeCbm: any; chargeableWeight: any; packages: number | null; packageType: string | null;
  originName: string; destName: string;
  containers: { containerNo: string; sealNo: string | null; type: string | null }[];
};

export type PdfCompany = {
  name: string; address: string | null; city: string | null; phone: string | null; email: string | null; npwp: string | null;
};

const TITLES: Record<string, string> = {
  hbl: "HOUSE BILL OF LADING",
  mbl: "MASTER BILL OF LADING",
  hawb: "HOUSE AIR WAYBILL",
  mawb: "MASTER AIR WAYBILL",
  si: "SHIPPING INSTRUCTION",
  arrival: "ARRIVAL NOTICE",
  do: "DELIVERY ORDER",
};

function PartyBox({ label, name, addr }: { label: string; name: string | null; addr: string | null }) {
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
      <Text style={s.boxValue}>{name ?? "-"}</Text>
      {addr ? <Text style={s.boxText}>{addr}</Text> : null}
    </View>
  );
}

export function JobDocument({ kind, job, company }: { kind: string; job: PdfJob; company: PdfCompany }) {
  const isAir = job.mode === "AIR";
  const docTitle = TITLES[kind] ?? "DOCUMENT";
  const refNo =
    kind === "mbl" ? job.mblNo : kind === "hbl" ? job.hblNo :
    kind === "mawb" ? job.mawbNo : kind === "hawb" ? job.hawbNo :
    job.hblNo ?? job.mblNo ?? job.number;

  return (
    <Document title={`${docTitle} - ${job.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.coName}>{company.name}</Text>
            <Text style={s.coMeta}>{company.address}{company.city ? `, ${company.city}` : ""}</Text>
            <Text style={s.coMeta}>Telp: {company.phone ?? "-"} · {company.email ?? ""}</Text>
            <Text style={s.coMeta}>NPWP: {company.npwp ?? "-"}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>{docTitle}</Text>
            <Text style={s.docNo}>No: {refNo ?? job.number}</Text>
            <Text style={s.docNo}>Job: {job.number}</Text>
          </View>
        </View>

        <View style={s.grid2}>
          <PartyBox label="Shipper / Exporter" name={job.shipperName} addr={job.shipperAddress} />
          <PartyBox label="Consignee" name={job.consigneeName} addr={job.consigneeAddress} />
        </View>
        <View style={s.grid2}>
          <PartyBox label="Notify Party" name={job.notifyName} addr={job.notifyAddress} />
          <View style={s.box}>
            <Text style={s.boxLabel}>{isAir ? "Flight / Route" : "Vessel / Voyage / Route"}</Text>
            <Text style={s.boxValue}>{isAir ? job.flightNo ?? "-" : `${job.vesselName ?? "-"} ${job.voyageNo ?? ""}`}</Text>
            <Text style={s.boxText}>{job.originName} → {job.destName}</Text>
            <Text style={s.boxText}>ETD {formatDate(job.etd)} · ETA {formatDate(job.eta)}</Text>
          </View>
        </View>

        <View style={[s.table]}>
          <View style={s.th}>
            <Text style={[s.thText, { flex: 2 }]}>Marks & Numbers</Text>
            <Text style={[s.thText, { flex: 1 }]}>Packages</Text>
            <Text style={[s.thText, { flex: 3 }]}>Description of Goods</Text>
            <Text style={[s.thText, { flex: 1 }]}>Gross Wt (kg)</Text>
            <Text style={[s.thText, { flex: 1 }]}>{isAir ? "Chg. Wt" : "Meas. (CBM)"}</Text>
          </View>
          <View style={s.td}>
            <Text style={{ flex: 2, fontSize: 8 }}>{job.containers.map((c) => c.containerNo).join("\n") || "AS ADDRESSED"}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{job.packages ?? "-"} {job.packageType ?? ""}</Text>
            <Text style={{ flex: 3, fontSize: 8 }}>{job.goodsDescription ?? "-"}{job.incoterm ? `\nIncoterm: ${job.incoterm}` : ""}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{job.grossWeightKg ? formatNumber(Number(job.grossWeightKg), 0) : "-"}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{isAir ? (job.chargeableWeight ? formatNumber(Number(job.chargeableWeight), 0) : "-") : (job.volumeCbm ? formatNumber(Number(job.volumeCbm), 2) : "-")}</Text>
          </View>
        </View>

        {job.containers.length > 0 && (
          <View style={s.section}>
            <Text style={[s.label, { marginTop: 8 }]}>Container / Seal</Text>
            <View style={s.table}>
              <View style={s.th}>
                <Text style={[s.thText, { flex: 2 }]}>Container No.</Text>
                <Text style={[s.thText, { flex: 1 }]}>Seal</Text>
                <Text style={[s.thText, { flex: 1 }]}>Type</Text>
              </View>
              {job.containers.map((c, i) => (
                <View key={i} style={s.td}>
                  <Text style={{ flex: 2, fontSize: 8 }}>{c.containerNo}</Text>
                  <Text style={{ flex: 1, fontSize: 8 }}>{c.sealNo ?? "-"}</Text>
                  <Text style={{ flex: 1, fontSize: 8 }}>{c.type ?? "-"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {(kind === "arrival" || kind === "do") && (
          <View style={s.descBox}>
            <Text style={{ fontSize: 8, color: "#374151" }}>
              {kind === "arrival"
                ? "Please be informed that the above shipment has arrived / is scheduled to arrive at the destination as per the schedule above. Kindly arrange for customs clearance and settlement of outstanding charges prior to cargo release."
                : "Please release the above-described cargo to the consignee or their authorized representative. This Delivery Order is issued subject to full settlement of all applicable charges."}
            </Text>
          </View>
        )}

        <View style={s.sign}>
          <View style={s.signBox}>
            <Text style={{ fontSize: 8, marginBottom: 28 }}>Authorized by {company.name}</Text>
            <View style={{ borderTop: 1, borderColor: "#9ca3af", width: 160, paddingTop: 3 }}>
              <Text style={{ fontSize: 7, textAlign: "center", color: "#6b7280" }}>Authorized Signature & Stamp</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{company.name} — Freight Forwarding & Logistics</Text>
          <Text>Dicetak {formatDate(new Date())}</Text>
        </View>
      </Page>
    </Document>
  );
}
