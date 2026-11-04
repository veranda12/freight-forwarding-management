import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { InvoiceSection } from "@prisma/client";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/enums";
import { amountInWords } from "@/lib/amount-words";

const INK = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#9ca3af"; // garis tabel
const HEAD = "#2f3e4e"; // latar header tabel
const SECTION = "#e3ecf5"; // latar baris seksi
const SHADE = "#eceff1"; // baris as receipt
const SOFT = "#f6f7f9";

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 46, paddingHorizontal: 34, fontSize: 8.5, fontFamily: "Helvetica", color: INK },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  brand: { flexDirection: "row", gap: 8, maxWidth: 300 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  coName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  coMeta: { fontSize: 7.5, color: "#374151", marginTop: 1.5 },
  titleBox: { width: 210 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#fff", backgroundColor: HEAD, paddingVertical: 5, paddingHorizontal: 8, textAlign: "center", letterSpacing: 1.5 },
  // Tabel bergaris: wadah memberi garis kiri+atas, setiap sel memberi garis kanan+bawah.
  grid: { borderLeftWidth: 0.75, borderLeftStyle: "solid", borderLeftColor: GRID, borderTopWidth: 0.75, borderTopStyle: "solid", borderTopColor: GRID },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 0.75, borderRightStyle: "solid", borderRightColor: GRID, borderBottomWidth: 0.75, borderBottomStyle: "solid", borderBottomColor: GRID, paddingVertical: 3, paddingHorizontal: 5 },
  th: { backgroundColor: HEAD, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7.2, textTransform: "uppercase", letterSpacing: 0.3 },
  label: { backgroundColor: SOFT, color: MUTED, fontSize: 7.5 },
  sectionCell: { backgroundColor: SECTION, fontFamily: "Helvetica-Bold" },
  shaded: { backgroundColor: SHADE },
  subCell: { backgroundColor: SOFT, fontFamily: "Helvetica-Bold" },
  totalCell: { backgroundColor: HEAD, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  note: { fontSize: 7, color: MUTED, marginTop: 1.5 },
  gap: { marginTop: 10 },
  legend: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  swatch: { width: 14, height: 8, backgroundColor: SHADE, border: 0.5, borderColor: GRID },
  footer: { position: "absolute", bottom: 22, left: 34, right: 34, borderTop: 0.5, borderColor: GRID, paddingTop: 5, fontSize: 6.5, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

export type PdfInvoiceLine = {
  section: InvoiceSection | null; name: string; note: string | null; qty: number; unitLabel: string | null;
  unitPrice: number; amount: number; asReceipt: boolean;
};
export type PdfExcludedLine = { section: InvoiceSection | null; name: string; unitLabel: string | null; reason: string };

export type PdfInvoice = {
  number: string; date: Date; dueDate: Date; termDays: number; currency: string; exchangeRate: number; amountForeign: number;
  subtotal: number; ppn: number; total: number; status: string;
  customer: { name: string; address: string | null; city: string | null; country: string | null; npwp: string | null };
  shipment: {
    jobNumber: string; blNo: string | null; vessel: string | null; route: string | null; containers: string | null;
    containerNos: string | null; lane: string | null;
  } | null;
  lines: PdfInvoiceLine[];
  excluded: PdfExcludedLine[];
};

export type PdfInvoiceCompany = {
  name: string; address: string | null; city: string | null; phone: string | null; email: string | null; npwp: string | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null; bankBranch: string | null;
  signatoryName: string | null; signatoryTitle: string | null; logoFile: string | null;
};

const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const LETTERS = "ABCDEFGHIJ";

type Group = { key: InvoiceSection | "OTHER"; letter: string; label: string; lines: PdfInvoiceLine[]; excluded: PdfExcludedLine[]; total: number };

/** Kelompokkan baris per seksi sesuai urutan cetak; baris tanpa seksi masuk "Other Charges" di akhir. */
function groupLines(inv: PdfInvoice): Group[] {
  const keys: (InvoiceSection | "OTHER")[] = [...SECTION_ORDER, "OTHER"];
  const groups: Group[] = [];
  for (const key of keys) {
    const match = (sec: InvoiceSection | null) => (key === "OTHER" ? sec == null : sec === key);
    const lines = inv.lines.filter((l) => match(l.section));
    if (lines.length === 0) continue;
    groups.push({
      key, letter: LETTERS[groups.length], label: key === "OTHER" ? "Other Charges" : SECTION_LABELS[key],
      lines, excluded: inv.excluded.filter((e) => match(e.section)), total: lines.reduce((t, l) => t + l.amount, 0),
    });
  }
  return groups;
}

type CellStyle = Record<string, any> | Record<string, any>[] | undefined;
/** Satu sel tabel bergaris. `w` lebar tetap (pt) atau undefined untuk mengisi sisa ruang. */
function Cell({ w, style, textStyle, children }: { w?: number; style?: CellStyle; textStyle?: any; children?: React.ReactNode }) {
  return (
    <View style={[s.cell, w ? { width: w } : { flex: 1 }, ...(Array.isArray(style) ? style : style ? [style] : [])]}>
      {typeof children === "string" || typeof children === "number" ? <Text style={textStyle}>{children}</Text> : children}
    </View>
  );
}

function Header({ company, title, inv, showDue }: { company: PdfInvoiceCompany; title: string; inv: PdfInvoice; showDue: boolean }) {
  const meta: [string, string][] = [["Invoice No.", inv.number], ["Date", date(inv.date)]];
  if (showDue) meta.push(["Due Date", date(inv.dueDate)], ["Terms", `${inv.termDays} days`]);
  return (
    <View style={s.header}>
      <View style={s.brand}>
        {company.logoFile ? <Image src={company.logoFile} style={s.logo} /> : null}
        <View>
          <Text style={s.coName}>{company.name}</Text>
          {company.address ? <Text style={s.coMeta}>{company.address}{company.city ? `, ${company.city}` : ""}</Text> : null}
          <Text style={s.coMeta}>{[company.phone && `Tel ${company.phone}`, company.email].filter(Boolean).join("  |  ")}</Text>
          {company.npwp ? <Text style={s.coMeta}>NPWP {company.npwp}</Text> : null}
        </View>
      </View>
      <View style={s.titleBox}>
        <Text style={s.title}>{title}</Text>
        <View style={s.grid}>
          {meta.map(([k, v]) => (
            <View key={k} style={s.row}>
              <Cell w={80} style={s.label}>{k}</Cell>
              <Cell textStyle={s.bold}>{v}</Cell>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Parties({ inv }: { inv: PdfInvoice }) {
  const sh = inv.shipment;
  const rows: [string, string | null | undefined][] = sh ? [
    ["Job No.", sh.jobNumber], ["B/L No.", sh.blNo], ["Vessel / Voyage", sh.vessel], ["Route", sh.route],
    ["Containers", sh.containers],
    ["Container No.", sh.containerNos],
    ["Customs Lane", sh.lane],
  ] : [];
  const shown = rows.filter(([, v]) => v);
  return (
    <View style={[s.row, { gap: 8 }]}>
      <View style={[s.grid, { flex: 1 }]}>
        <View style={s.row}><Cell style={s.th}>Bill To</Cell></View>
        <View style={[s.row, { flexGrow: 1 }]}>
          <Cell>
            <Text style={[s.bold, { fontSize: 9.5, marginBottom: 2 }]}>{inv.customer.name}</Text>
            {inv.customer.address ? <Text style={{ color: "#374151" }}>{inv.customer.address}</Text> : null}
            <Text style={{ color: "#374151" }}>{[inv.customer.city, inv.customer.country].filter(Boolean).join(", ")}</Text>
            {inv.customer.npwp ? <Text style={{ color: "#374151", marginTop: 2 }}>NPWP {inv.customer.npwp}</Text> : null}
          </Cell>
        </View>
      </View>
      <View style={[s.grid, { flex: 1.25 }]}>
        <View style={s.row}><Cell style={s.th}>Shipment</Cell></View>
        {shown.length ? shown.map(([k, v]) => (
          <View key={k} style={s.row}>
            <Cell w={78} style={s.label}>{k}</Cell>
            <Cell>{v as string}</Cell>
          </View>
        )) : <View style={s.row}><Cell>-</Cell></View>}
      </View>
    </View>
  );
}

/** Subtotal, PPN, dan total dalam tabel bergaris di sisi kanan. */
function Totals({ inv }: { inv: PdfInvoice }) {
  const rows: [string, string][] = [["Subtotal", `IDR ${num(inv.subtotal)}`]];
  if (inv.ppn > 0) rows.push(["VAT (PPN) 11%", `IDR ${num(inv.ppn)}`]);
  return (
    <View style={[s.grid, { marginLeft: "auto", width: 250, marginTop: 8 }]} wrap={false}>
      {rows.map(([k, v]) => (
        <View key={k} style={s.row}><Cell style={s.label}>{k}</Cell><Cell w={120} textStyle={s.right}>{v}</Cell></View>
      ))}
      <View style={s.row}><Cell style={s.totalCell}>TOTAL</Cell><Cell w={120} style={s.totalCell} textStyle={s.right}>{`IDR ${num(inv.total)}`}</Cell></View>
      {inv.currency !== "IDR" ? (
        <View style={s.row}><Cell style={s.label}>{`Amount due in ${inv.currency}`}</Cell><Cell w={120} textStyle={s.right}>{`${inv.currency} ${num(inv.amountForeign)} @ ${num(inv.exchangeRate)}`}</Cell></View>
      ) : null}
    </View>
  );
}

function Footer({ company, inv }: { company: PdfInvoiceCompany; inv: PdfInvoice }) {
  return (
    <View style={s.footer} fixed>
      <Text>{company.name}  |  {inv.number}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// Lebar kolom tabel detail (pt). Deskripsi mengisi sisa.
const W = { no: 26, qty: 38, unit: 46, price: 76, amt: 84 };

/** Invoice ringkas (total per seksi) dan invoice detail (per baris) dalam satu PDF. */
export function InvoiceDocument({ inv, company }: { inv: PdfInvoice; company: PdfInvoiceCompany }) {
  const groups = groupLines(inv);
  const hasReceipt = inv.lines.some((l) => l.asReceipt);
  const cancelled = inv.status === "CANCELLED";

  return (
    <Document title={`Invoice ${inv.number}`} author={company.name}>
      {/* 1. INVOICE (ringkas) */}
      <Page size="A4" style={s.page}>
        <Header company={company} title={cancelled ? "INVOICE (CANCELLED)" : "INVOICE"} inv={inv} showDue />
        <Parties inv={inv} />

        <View style={[s.grid, s.gap]}>
          <View style={s.row}>
            <Cell w={W.no} style={s.th} textStyle={s.center}>No</Cell>
            <Cell style={s.th}>Description</Cell>
            <Cell w={60} style={s.th} textStyle={s.center}>Items</Cell>
            <Cell w={110} style={s.th} textStyle={s.right}>Amount (IDR)</Cell>
          </View>
          {groups.map((g) => (
            <View key={g.key} style={s.row} wrap={false}>
              <Cell w={W.no} textStyle={[s.center, s.bold]}>{g.letter}</Cell>
              <Cell>{g.label}</Cell>
              <Cell w={60} textStyle={s.center}>{String(g.lines.length)}</Cell>
              <Cell w={110} textStyle={s.right}>{num(g.total)}</Cell>
            </View>
          ))}
        </View>
        <Totals inv={inv} />

        <View style={[s.grid, s.gap]} wrap={false}>
          <View style={s.row}><Cell w={110} style={s.label}>Amount in words</Cell><Cell textStyle={{ fontFamily: "Helvetica-Oblique" }}>{amountInWords(inv.total)}</Cell></View>
        </View>
        <Text style={{ marginTop: 5, fontSize: 7.5, color: MUTED }}>Breakdown of each section is shown in the attached Invoice Detail.</Text>

        <View style={[s.row, { gap: 8, marginTop: 14 }]} wrap={false}>
          <View style={[s.grid, { flex: 1 }]}>
            <View style={s.row}><Cell style={s.th}>Payment Information</Cell></View>
            {[["Bank", company.bankName ? `${company.bankName}${company.bankBranch ? `, ${company.bankBranch}` : ""}` : null],
              ["Account No.", company.bankAccount], ["Account Name", company.bankHolder], ["Due Date", date(inv.dueDate)]]
              .filter(([, v]) => v).map(([k, v]) => (
                <View key={k as string} style={s.row}><Cell w={78} style={s.label}>{k as string}</Cell><Cell textStyle={k === "Account No." ? s.bold : undefined}>{v as string}</Cell></View>
              ))}
            <View style={[s.row, { flexGrow: 1 }]}><Cell textStyle={{ fontSize: 7.2, color: MUTED }}>Please quote the invoice number in the transfer reference.</Cell></View>
          </View>
          <View style={[s.grid, { width: 190 }]}>
            <View style={s.row}><Cell style={s.th} textStyle={s.center}>Authorized Signature</Cell></View>
            <View style={[s.row, { flexGrow: 1 }]}>
              <Cell style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 7.5 }}>For and on behalf of</Text>
                <Text style={[s.bold, { marginTop: 1, textAlign: "center" }]}>{company.name}</Text>
                <View style={{ height: 46 }} />
                <View style={{ borderTop: 0.75, borderColor: INK, width: 150, paddingTop: 3, alignItems: "center" }}>
                  <Text style={s.bold}>{company.signatoryName ?? " "}</Text>
                  {company.signatoryTitle ? <Text style={{ fontSize: 7, color: MUTED }}>{company.signatoryTitle}</Text> : null}
                </View>
              </Cell>
            </View>
          </View>
        </View>
        <Footer company={company} inv={inv} />
      </Page>

      {/* 2. INVOICE DETAIL (per baris) */}
      <Page size="A4" style={s.page}>
        <Header company={company} title="INVOICE DETAIL" inv={inv} showDue={false} />
        <Parties inv={inv} />

        <View style={[s.grid, s.gap]}>
          <View style={s.row} fixed>
            <Cell w={W.no} style={s.th} textStyle={s.center}>No</Cell>
            <Cell style={s.th}>Description</Cell>
            <Cell w={W.qty} style={s.th} textStyle={s.center}>Qty</Cell>
            <Cell w={W.unit} style={s.th} textStyle={s.center}>Unit</Cell>
            <Cell w={W.price} style={s.th} textStyle={s.right}>Unit Price</Cell>
            <Cell w={W.amt} style={s.th} textStyle={s.right}>Amount (IDR)</Cell>
          </View>
          {groups.map((g) => (
            <View key={g.key}>
              <View style={s.row} wrap={false}>
                <Cell w={W.no} style={s.sectionCell} textStyle={s.center}>{g.letter}</Cell>
                <Cell style={s.sectionCell}>{g.label}</Cell>
              </View>
              {g.lines.map((l, i) => {
                const bg = l.asReceipt ? s.shaded : undefined;
                return (
                  <View key={i} style={s.row} wrap={false}>
                    <Cell w={W.no} style={bg} textStyle={s.center}>{String(i + 1)}</Cell>
                    <Cell style={bg}>
                      <Text>{l.name}</Text>
                      {l.note ? <Text style={s.note}>{l.note}</Text> : null}
                    </Cell>
                    <Cell w={W.qty} style={bg} textStyle={s.center}>{num(l.qty)}</Cell>
                    <Cell w={W.unit} style={bg} textStyle={s.center}>{l.unitLabel ?? "-"}</Cell>
                    <Cell w={W.price} style={bg} textStyle={s.right}>{num(l.unitPrice)}</Cell>
                    <Cell w={W.amt} style={bg} textStyle={s.right}>{num(l.amount)}</Cell>
                  </View>
                );
              })}
              {g.excluded.map((e, i) => (
                <View key={`x${i}`} style={s.row} wrap={false}>
                  <Cell w={W.no} textStyle={[s.center, { color: MUTED }]}>{String(g.lines.length + i + 1)}</Cell>
                  <Cell><Text style={{ color: MUTED }}>{e.name}</Text><Text style={s.note}>{e.reason}</Text></Cell>
                  <Cell w={W.qty} textStyle={[s.center, { color: MUTED }]}>-</Cell>
                  <Cell w={W.unit} textStyle={[s.center, { color: MUTED }]}>{e.unitLabel ?? "-"}</Cell>
                  <Cell w={W.price} textStyle={[s.right, { color: MUTED }]}>-</Cell>
                  <Cell w={W.amt} textStyle={[s.right, { color: MUTED, fontFamily: "Helvetica-Oblique" }]}>Excluded</Cell>
                </View>
              ))}
              <View style={s.row} wrap={false}>
                <Cell style={s.subCell} textStyle={s.right}>{`Subtotal ${g.letter}`}</Cell>
                <Cell w={W.amt} style={s.subCell} textStyle={s.right}>{num(g.total)}</Cell>
              </View>
            </View>
          ))}
        </View>
        <Totals inv={inv} />
        {hasReceipt ? (
          <View style={s.legend}><View style={s.swatch} /><Text style={{ fontSize: 7, color: MUTED }}>Shaded rows are actual costs charged as per receipt, without mark-up.</Text></View>
        ) : null}
        <Footer company={company} inv={inv} />
      </Page>
    </Document>
  );
}
