import { cp, mkdtemp, rm, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const root = process.cwd();
await access(join(root, ".next/standalone/server.js"));
const directory = await mkdtemp(join(tmpdir(), "sportsdesk-isolated-"));
let child;
try {
  await cp(join(root, ".next/standalone"), directory, { recursive: true });
  await cp(join(root, ".next/static"), join(directory, ".next/static"), {
    recursive: true,
  });
  if ((await readdir(directory)).includes("signalbot"))
    throw new Error("Inspiration directory leaked into the runtime package.");
  const port = 3217;
  child = spawn(process.execPath, [resolve(directory, "server.js")], {
    cwd: directory,
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
    stdio: "pipe",
  });
  let logs = "";
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${origin}/api/board?mode=demo`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error(`Isolated server did not start: ${logs}`);
  const html = await (await fetch(`${origin}/?mode=demo`)).text();
  if (!html.includes("Your edge starts here.") || !html.includes("SAMPLE DATA"))
    throw new Error("Standalone workspace failed to render.");
  const board = await (await fetch(`${origin}/api/board?mode=demo`)).json();
  const research = await (
    await fetch(`${origin}/api/research?league=NBA&id=demo-1`)
  ).json();
  if (board.games.length !== 8 || !research.players.length)
    throw new Error("Standalone research flow failed.");
  console.log(
    "PASS: copied production runtime starts in an isolated temporary directory without signalbot; workspace, board API and research API verified.",
  );
} finally {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(directory, { recursive: true, force: true });
}
