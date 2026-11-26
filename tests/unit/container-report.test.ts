import { describe, expect, it } from "vitest";
import { containerDate, containerReport, monthKeyJakarta, NO_TYPE, type ContainerJob } from "@/lib/container-report";

const T20 = { code: "20GP", teu: 1 };
const T40 = { code: "40HC", teu: 2 };
const job = (id: string, over: Partial<ContainerJob>): ContainerJob => ({
  id, number: id, customer: "PT A", direction: "IMPORT", etd: null, atd: null, eta: null, ata: null,
  openedAt: new Date("2026-01-10T03:00:00Z"), containers: [{ containerNo: "MSKU1234565", type: T20 }], ...over,
});

describe("containerDate", () => {
  it("impor pakai ATA lalu ETA, ekspor pakai ATD lalu ETD, tanpa jadwal pakai tanggal buka", () => {
    const eta = new Date("2026-03-05"), ata = new Date("2026-03-07"), etd = new Date("2026-02-01");
    expect(containerDate(job("a", { eta }))).toEqual(eta);
    expect(containerDate(job("a", { eta, ata }))).toEqual(ata);
    expect(containerDate(job("a", { direction: "EXPORT", etd, eta }))).toEqual(etd);
    expect(containerDate(job("a", {}))).toEqual(new Date("2026-01-10T03:00:00Z"));
  });

  it("bulan dihitung dalam WIB", () => {
    expect(monthKeyJakarta(new Date("2026-03-31T18:00:00Z"))).toBe("2026-04");
    expect(monthKeyJakarta(new Date("2026-03-31T16:00:00Z"))).toBe("2026-03");
  });
});

describe("containerReport", () => {
  it("menghitung container, tipe, dan TEU per bulan", () => {
    const r = containerReport([
      job("j1", { eta: new Date("2026-11-03"), containers: [{ containerNo: "A", type: T20 }, { containerNo: "B", type: T40 }] }),
      job("j2", { eta: new Date("2026-11-20"), containers: [{ containerNo: "C", type: T40 }, { containerNo: "D", type: null }] }),
      job("j3", { eta: new Date("2026-10-01") }),
      job("j4", { eta: new Date("2025-11-01") }), // tahun lain
      job("j5", { eta: new Date("2026-11-05"), containers: [] }), // tanpa container
    ], 2026);
    const nov = r.months[10];
    expect(nov.month).toBe("2026-11");
    expect(nov.jobs.map((j) => j.id)).toEqual(["j1", "j2"]);
    expect(nov.byType).toEqual({ "20GP": 1, "40HC": 2, [NO_TYPE]: 1 });
    expect(nov.containers).toBe(4);
    expect(nov.teu).toBe(5);
    expect(r.months[9].containers).toBe(1);
    expect(r.types).toEqual(["20GP", "40HC", NO_TYPE]);
    expect(r.total).toMatchObject({ jobs: 3, containers: 5, teu: 6 });
  });
});
