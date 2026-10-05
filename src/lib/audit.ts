import { prisma } from "./prisma";

export async function writeAudit(params: {
  entity: string;
  entityId: string;
  action: string;
  summary?: string;
  changes?: unknown;
  userId?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        summary: params.summary,
        changes: params.changes ? (params.changes as any) : undefined,
        userId: params.userId ?? undefined,
      },
    });
  } catch {
    // audit tidak boleh menggagalkan operasi utama
  }
}
