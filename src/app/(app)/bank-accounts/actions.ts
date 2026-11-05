"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPerm } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { createBankAccount, updateBankAccount, type BankAccountInput } from "@/lib/cash-accounts";
import { errorMessage } from "@/lib/action-error";

type Result = { ok: true } | { ok: false; error: string };

export async function saveBankAccountAction(id: string | null, input: BankAccountInput): Promise<Result> {
  const user = await assertPerm("bankAccounts.edit");
  try {
    if (id) {
      const r = await updateBankAccount(prisma, id, input);
      await writeAudit({ entity: "BankAccount", entityId: r.id, action: "UPDATE", summary: r.name, userId: user.id });
    } else {
      const r = await createBankAccount(prisma, input);
      await writeAudit({ entity: "BankAccount", entityId: r.id, action: "CREATE", summary: `${r.name} (COA ${r.coaCode})`, userId: user.id });
    }
    for (const p of ["/bank-accounts", "/coa", "/accounting", "/accounting/bank-rec", "/accounting/cash-entry"]) revalidatePath(p);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e, "Gagal menyimpan rekening.") };
  }
}
