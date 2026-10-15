import { cp, access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false);
const runtime = resolve(".next/standalone");
try {
  await access(resolve(runtime, "server.js"));
} catch {
  console.error("Production build missing. Run npm run build first.");
  process.exit(1);
}
await cp(resolve(".next/static"), resolve(runtime, ".next/static"), {
  recursive: true,
});
const child = spawn(process.execPath, [resolve(runtime, "server.js")], {
  cwd: runtime,
  env: { ...process.env, HOSTNAME: process.env.SPORTSDESK_HOST ?? "0.0.0.0" },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
