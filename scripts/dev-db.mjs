// `pnpm db:up` — start the Postgres this repo's dev server and integration tests expect.
//
// This used to be `docker-compose up -d db`, and docker-compose.yml still describes that setup
// because CI runs the same images. But the machines this is developed on no longer have Docker
// installed, so the script pointed at a binary that wasn't there. The failure was not obvious
// from the outside — the backend boots fine without a database, because Prisma connects lazily
// on the first query rather than at startup, so the app looks healthy and only 500s on requests
// that touch data. Two separate sessions lost time hunting for that. Hence a launcher that
// either starts the database or says exactly what to do instead.
//
// `pnpm db:up:docker` is still there for anyone who does have Docker.
//
// The cluster lives outside the repo, one per developer, because it is a real data directory:
// `~/.blibli-dev-db`, started by its own `start.mjs` (embedded-postgres, port 5432, user
// `blibli`). Point LOCAL_PG_DIR somewhere else if yours is.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import net from "node:net";
import path from "node:path";

const PORT = 5432;
const dir = process.env.LOCAL_PG_DIR ?? path.join(homedir(), ".blibli-dev-db");
const launcher = path.join(dir, "start.mjs");

/** True if something already answers on the port, so this stays a no-op like `up -d` was. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const settle = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.setTimeout(1000, () => settle(false));
  });
}

if (await portInUse(PORT)) {
  console.log(`Postgres already listening on ${PORT} — nothing to do.`);
  process.exit(0);
}

if (!existsSync(launcher)) {
  console.error(
    `No local Postgres launcher found at:\n  ${launcher}\n\n` +
      "Create it once (a standalone folder, deliberately not part of this repo — it holds a\n" +
      "real data directory that must survive branch switches and clean checkouts):\n\n" +
      `  mkdir "${dir}"\n` +
      `  cd "${dir}"\n` +
      "  npm init -y && npm install embedded-postgres pg\n" +
      "  # then add start.mjs: EmbeddedPostgres on port 5432, user/password blibli,\n" +
      "  # databaseDir ./data, persistent: true, and process.stdin.resume() at the end so\n" +
      "  # the server stays up with the process.\n\n" +
      "Already have one elsewhere?  set LOCAL_PG_DIR to that folder.\n" +
      "Have Docker?                 run `pnpm db:up:docker` instead.",
  );
  process.exit(1);
}

// Foreground on purpose. The launcher owns the Postgres server it spawned and holds it open by
// keeping stdin alive — detaching this would take the database down with the shell. Leave the
// terminal open, or run it in one of its own.
console.log(`Starting Postgres from ${launcher}  (Ctrl-C to stop)`);
const child = spawn(process.execPath, [launcher], { stdio: "inherit", cwd: dir });
child.on("exit", (code) => process.exit(code ?? 0));
