import { cp, mkdtemp, rm, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const root = process.cwd();
await access(join(root, ".next/standalone/server.js"));
const directory = await mkdtemp(join(tmpdir(), "oracular-isolated-"));
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
  const [weather, elections, rankings] = await Promise.all([
    fetch(`${origin}/api/weather?mode=demo&date=2026-10-16`).then((r) =>
      r.json(),
    ),
    fetch(`${origin}/api/elections?mode=demo`).then((r) => r.json()),
    fetch(`${origin}/api/rankings?mode=demo&date=2026-10-15`).then((r) =>
      r.json(),
    ),
  ]);
  if (
    weather.rows?.length !== 9 ||
    elections.rows?.length !== 10 ||
    rankings.sports?.length !== 14
  )
    throw new Error("Standalone multi-market routes failed.");
  const electionResearch = await (
    await fetch(`${origin}/api/elections/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId: "michigan-governor", mode: "demo" }),
    })
  ).json();
  if (electionResearch.mode !== "demo" || electionResearch.polls?.length !== 3)
    throw new Error("Standalone election research failed.");
  console.log(
    "PASS: copied production runtime starts in an isolated temporary directory without signalbot; workspace, sports research, weather, elections, rankings and sample election analysis verified.",
  );
} finally {
  if (child) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  await rm(directory, { recursive: true, force: true });
}
