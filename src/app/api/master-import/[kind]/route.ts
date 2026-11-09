import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/action-error";
import { commitImport, isImportKind, MAX_BYTES, previewImport, IMPORT_LABEL } from "@/lib/master-import";

export const runtime = "nodejs";

const ENTITY = { customers: "Customer", vendors: "Vendor", commodities: "Commodity" } as const;

/**
 * Import Excel master: form-data `file` (.xlsx) dan `mode` = "preview" (tidak menulis) atau "commit" (simpan).
 * Lewat route handler, bukan server action, supaya file sampai 2 MB tidak terbentur batas body server action (1 MB)
 * tanpa mengubah konfigurasi global. Izin sama dengan form Baru entitas itu.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!isImportKind(kind)) return NextResponse.json({ ok: false, error: "Jenis data tidak dikenal." }, { status: 404 });
  // Tolak kiriman dari situs lain (cookie sesi ikut terkirim pada POST sesama situs saja, ini lapisan kedua).
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ ok: false, error: "Asal permintaan tidak valid." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sesi berakhir, silakan login ulang." }, { status: 401 });
  if (!can(user.role, kind, "write")) return NextResponse.json({ ok: false, error: `Tidak punya izin menambah data ${IMPORT_LABEL[kind]}.` }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Kiriman tidak valid." }, { status: 400 }); }
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Pilih file Excel (.xlsx)." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "File melebihi 2 MB." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ ok: false, error: "Hanya file .xlsx (Excel Workbook). File .xls / .csv simpan ulang sebagai .xlsx." }, { status: 400 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode === "commit") {
      const r = await commitImport(prisma, kind, buffer);
      const s = r.summary;
      await writeAudit({
        entity: ENTITY[kind], entityId: "import-excel", action: "IMPORT", userId: user.id,
        summary: `Import Excel ${file.name}: ${s.create} baru, ${s.update} diperbarui, ${s.unchanged} tidak berubah, ${s.skip} dilewati`,
        changes: { file: file.name, summary: s, created: r.created },
      });
      revalidatePath(`/${kind}`);
      return NextResponse.json({ ok: true, committed: true, summary: s, rows: r.rows });
    }
    const r = await previewImport(prisma, kind, buffer);
    return NextResponse.json({ ok: true, committed: false, summary: r.summary, rows: r.rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errorMessage(e, "Gagal membaca file.") }, { status: 400 });
  }
}
