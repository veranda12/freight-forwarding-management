import { ForbiddenError } from "./auth-helpers";
import { logger } from "./logger";

/**
 * Error yang memang ditujukan ke user (validasi, aturan bisnis, hak akses) dilempar sebagai `new Error("...")`
 * atau ForbiddenError. Selain itu (error database, TypeError, dan sejenisnya) adalah bug yang perlu dicatat.
 */
export function isUnexpectedError(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  return e.constructor !== Error && !(e instanceof ForbiddenError);
}

/** Pesan untuk dikembalikan dari server action. Error tak terduga dicatat ke log dan pesannya disamarkan. */
export function errorMessage(e: unknown, fallback: string): string {
  if (isUnexpectedError(e)) {
    void logger.error(`Server action gagal: ${fallback}`, { error: e });
    return `${fallback} Terjadi kesalahan sistem dan sudah dicatat di log.`;
  }
  return (e as Error).message;
}
