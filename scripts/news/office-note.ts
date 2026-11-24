// Leaves Sara a note in Tradr HQ, through the same door the news scout uses (scout.sh note_sara → HQ
// `office/runner/cli.ts note-sara`). It arrives in Sara's chat as "[Note from the news scout]" (24 Nov 2026).
// Best effort: a 60 s limit, never throws, returns whether the note was left.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const HQ = path.join(os.homedir(), "Desktop/Tradr HQ");
const NODE = path.join(os.homedir(), ".nvm/versions/node/v20.19.5/bin/node");

export async function noteSara(title: string, summary: string, where?: string): Promise<{ ok: boolean; out: string }> {
  // NOTE_DRY=1 prints the note instead of leaving it (same switch as scout.sh).
  if (process.env.NOTE_DRY) {
    console.log(`TITLE: ${title}\nSUMMARY:\n${summary}${where ? `\nWHERE: ${where}` : ""}`);
    return { ok: true, out: "dry" };
  }
  const args = ["--import", "tsx", "office/runner/cli.ts", "note-sara", "--title", title.slice(0, 200), "--summary", summary.slice(0, 2000)];
  if (where) args.push("--where", where.slice(0, 500));
  return new Promise((resolve) => {
    let out = "";
    const p = spawn(NODE, args, { cwd: HQ, stdio: ["ignore", "pipe", "pipe"] });
    const t = setTimeout(() => p.kill("SIGTERM"), 60_000);
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (out += b));
    p.on("error", (e) => { clearTimeout(t); resolve({ ok: false, out: e.message }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ ok: code === 0, out: out.trim().slice(0, 300) }); });
  });
}
