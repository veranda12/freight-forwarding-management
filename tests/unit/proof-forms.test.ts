import { describe, expect, it } from "vitest";
import { formatEffectiveDate, formOfNumber, validateProofForms, PROOF_FORMS } from "../../src/lib/proof-forms";

describe("formulir bukti SOP", () => {
  it("formulir dari kode nomor bukti", () => {
    expect(formOfNumber("SLG/BK/26/11/06/0258")).toBe("BBK");
    expect(formOfNumber("SLG/BM/26/11/06/0001")).toBe("BBM");
    expect(formOfNumber("SLG/KK/26/11/06/0001")).toBe("BKK");
    expect(formOfNumber("SLG/KM/26/11/001")).toBe("BKM");
    expect(formOfNumber("SLG/JU/26/11/06/0001")).toBe("JU");
    expect(formOfNumber("JE/2026/11/0001")).toBe("JU");
  });
  it("Effective Date seperti contoh client: 1-Aug-18", () => {
    expect(formatEffectiveDate(new Date("2018-08-01T00:00:00Z"))).toBe("1-Aug-18");
    expect(formatEffectiveDate(null)).toBe("");
  });
  it("isian kosong boleh, nilai dirapikan", () => {
    const [r] = validateProofForms([{ code: "BBK", docNo: " FRM/FIN/01 ", revision: "01", effectiveDate: "2018-08-01" }]);
    expect(r).toEqual({ code: "BBK", docNo: "FRM/FIN/01", revision: "01", effectiveDate: new Date("2018-08-01T00:00:00Z") });
    expect(validateProofForms([{ code: "JU", docNo: "", revision: "", effectiveDate: "" }])[0]).toMatchObject({ docNo: null, revision: null, effectiveDate: null });
  });
  it("input tidak sah ditolak", () => {
    expect(() => validateProofForms([{ code: "XX" as never, docNo: "", revision: "", effectiveDate: "" }])).toThrow(/tidak dikenal/);
    expect(() => validateProofForms([{ code: "BBK", docNo: "x".repeat(41), revision: "", effectiveDate: "" }])).toThrow(/Doc. No/);
    expect(() => validateProofForms([{ code: "BBK", docNo: "", revision: "x".repeat(21), effectiveDate: "" }])).toThrow(/Revision/);
    expect(() => validateProofForms([{ code: "BBK", docNo: "", revision: "", effectiveDate: "2026-02-30" }])).toThrow(/Effective Date/);
    expect(() => validateProofForms([{ code: "BBK", docNo: "", revision: "", effectiveDate: "1-Aug-18" }])).toThrow(/Effective Date/);
  });
  it("tujuh formulir: kas/bank masuk-keluar, jurnal, voucher pengeluaran dan penerimaan", () => {
    expect(PROOF_FORMS.map((f) => f.code)).toEqual(["BBM", "BBK", "BKM", "BKK", "JU", "VC", "VM"]);
  });
});
