"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/auth-helpers";
import { entryActions } from "@/lib/proof-lines";
import { cancelInvoice } from "../invoices/actions";
import { cancelReceiptAction, cancelVendorPaymentAction } from "../payments/actions";
import { cancelCashEntryAction, cancelManualJournalAction, cancelTaxRemitAction, cancelTransferAction } from "../accounting/actions";
import { cancelVoucherAction } from "../vouchers/actions";
import { cancelBillAction } from "../bills/actions";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Batalkan bukti dari baris jurnal Cari Bukti. Jenis pembatalan ditentukan ulang di server dari jurnalnya,
 * lalu diteruskan ke action modul asal, yang memeriksa izin dan aturannya sendiri (periode terkunci, rekonsiliasi, dsb.).
 */
export async function cancelProofAction(journalEntryId: string, reason: string): Promise<Result> {
  const user = await assertCan("proofs", "read");
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Alasan pembatalan wajib diisi (minimal 3 huruf)." };
  const e = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    select: { id: true, source: true, sourceId: true, isReversal: true, isReversed: true },
  });
  if (!e) return { ok: false, error: "Jurnal tidak ditemukan." };
  const kind = entryActions(e, user.role).cancel;
  if (!kind) return { ok: false, error: "Bukti ini tidak bisa dibatalkan dari sini." };

  let r: { ok: boolean; error?: string };
  switch (kind) {
    case "invoice": r = await cancelInvoice(e.sourceId!); break;
    case "bill": r = await cancelBillAction(e.sourceId!, why); break;
    case "receipt": r = await cancelReceiptAction(e.sourceId!, why); break;
    case "vendorPayment": r = await cancelVendorPaymentAction(e.sourceId!, why); break;
    case "cashEntry": r = await cancelCashEntryAction(e.id, why); break;
    case "transfer": r = await cancelTransferAction(e.id, why); break;
    case "manual": r = await cancelManualJournalAction(e.id, why); break;
    case "voucher": r = await cancelVoucherAction(e.sourceId!, why); break;
    case "tax": {
      const remit = await prisma.taxRemittance.findFirst({ where: { journalEntryId: e.id }, select: { id: true } });
      if (!remit) return { ok: false, error: "Setoran pajak tidak ditemukan." };
      r = await cancelTaxRemitAction(remit.id, why);
      break;
    }
  }
  revalidatePath("/proofs");
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Gagal membatalkan bukti." };
}
