import type { Instrumentation } from "next";

// Logger memakai fs, jadi hanya dimuat di runtime Node. Pola `=== "nodejs"` membuat import ini dibuang dari bundle edge.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger");
    // Error yang lolos dari semua penanganan, supaya proses tidak mati tanpa jejak.
    process.on("unhandledRejection", (reason) => { void logger.error("Unhandled promise rejection", { error: reason }); });
    process.on("uncaughtExceptionMonitor", (err) => { void logger.error("Uncaught exception", { error: err }); });
  }
}

/** Semua error yang tidak tertangani di server component, route handler, server action, dan middleware. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("./lib/logger");
    await logger.error(err instanceof Error ? err.message : "Request error", {
      error: err,
      method: request.method,
      path: request.path,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    });
  } else {
    console.error("[server] request error", request.method, request.path, err);
  }
};
