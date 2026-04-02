export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logStructured } = await import("@/lib/observability");
    logStructured("info", "server_start", {
      node: process.version,
    });
  }
}
