import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

process.chdir(fileURLToPath(new URL(".", import.meta.url)));
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Install Node.js 24 or newer, then run this command again.");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY && !existsSync(".env")) {
  if (!process.stdin.isTTY) {
    console.error("Create .env using .env.example and add your Anthropic API key.");
    process.exit(1);
  }
  process.stdout.write("Paste your Anthropic API key (hidden), then press Enter: ");
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: hidden, terminal: true });
  const key = await new Promise(resolve => input.question("", resolve));
  input.close();
  process.stdout.write("\n");
  if (!key.trim()) {
    console.error("No key entered. Run node start.mjs again when ready.");
    process.exit(1);
  }
  writeFileSync(".env", `ANTHROPIC_API_KEY=${key.trim()}\n`, { mode: 0o600 });
}
const windows = process.platform === "win32";
function run(command, args) {
  return spawn(command, args, { stdio: "inherit", shell: windows && command === "npm" });
}
if (!existsSync("node_modules")) {
  console.log("Installing dependencies...");
  const install = run("npm", ["ci"]);
  const code = await new Promise(resolve => {
    install.on("exit", resolve);
    install.on("error", error => { console.error(error.message); resolve(1); });
  });
  if (code !== 0) process.exit(code ?? 1);
}
console.log("Starting the app at http://localhost:5173. Press Ctrl+C to stop.");
const server = run(process.execPath, ["server/server.js"]);
const frontend = run("npm", ["run", "dev", "--", "--port", "5173", "--strictPort", "--open"]);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [server, frontend]) {
    if (windows && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill();
    }
  }
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of [server, frontend]) {
  child.on("exit", code => stop(code ?? 1));
  child.on("error", error => { console.error(error.message); stop(1); });
}
