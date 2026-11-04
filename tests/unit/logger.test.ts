import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatEntry, listLogDays, readLogs, sanitize, serializeError, todayLogDay, writeLog } from "../../src/lib/logger";

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffms-log-")); process.env.LOG_DIR = dir; });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.LOG_DIR; });

describe("sanitize", () => {
  it("menyembunyikan nilai rahasia di semua kedalaman", () => {
    const out = sanitize({ email: "a@b.c", password: "x", nested: { authToken: "t", cookie: "c", ok: 1 } }) as any;
    expect(out.email).toBe("a@b.c");
    expect(out.password).toBe("[redacted]");
    expect(out.nested).toEqual({ authToken: "[redacted]", cookie: "[redacted]", ok: 1 });
  });
  it("memotong teks panjang dan mengubah Error menjadi objek", () => {
    expect((sanitize("x".repeat(5000)) as string).length).toBeLessThan(4100);
    const e = sanitize(Object.assign(new TypeError("boom"), { digest: "123" })) as any;
    expect(e).toMatchObject({ name: "TypeError", message: "boom", digest: "123" });
    expect(typeof e.stack).toBe("string");
  });
});

describe("formatEntry", () => {
  it("satu baris JSON dengan waktu Jakarta", () => {
    const line = formatEntry("error", "client", "gagal", { url: "/x" }, new Date("2026-11-03T01:02:03Z"));
    const e = JSON.parse(line);
    expect(e).toMatchObject({ level: "error", source: "client", message: "gagal", url: "/x", time: "2026-11-03T08:02:03.000+07:00" });
    expect(line.includes("\n")).toBe(false);
  });
  it("meta tidak bisa menimpa level atau pesan", () => {
    const e = JSON.parse(formatEntry("warn", "server", "asli", { level: "info", message: "palsu" }));
    expect(e.level).toBe("warn");
    expect(e.message).toBe("asli");
  });
});

describe("writeLog dan readLogs", () => {
  it("menulis ke file harian lalu membaca dengan filter, terbaru dulu", async () => {
    await writeLog("error", "server", "db mati", { error: serializeError(new Error("ECONNREFUSED")), path: "/jobs" });
    await writeLog("warn", "client", "lambat", { url: "http://x/invoices" });
    await writeLog("error", "client", "undefined is not a function", { url: "http://x/jobs/1" });
    fs.appendFileSync(path.join(dir, `app-${todayLogDay()}.log`), "{baris rusak\n");

    const day = todayLogDay();
    expect(await listLogDays()).toEqual([day]);
    const all = await readLogs(day);
    expect(all.total).toBe(3);
    expect(all.entries[0].message).toBe("undefined is not a function");
    expect((await readLogs(day, { level: "error" })).total).toBe(2);
    expect((await readLogs(day, { source: "client" })).total).toBe(2);
    expect((await readLogs(day, { q: "econnrefused" })).entries.map((e) => e.message)).toEqual(["db mati"]);
    expect((await readLogs("../../etc")).total).toBe(0);
  });
});
