# ZK PANEL

**Your infrastructure, in control.** A unified hosting panel for Minecraft worlds, game servers, containers, websites, and bots.

ZK combines a charcoal-and-lime React interface with a TypeScript API, SQLite persistence, a Docker runtime, a dedicated-node agent, and a Discord companion. Its native **ZIYN** deployment templates replace the conventional egg workflow. **ZK Autopilot** adds per-deployment recovery, backup policies, optional idle sleep, and spending-threshold alerts.

> **Release status: functional v0.1 foundation, not an audited production hosting service.** The interactive preview runs in explicitly labelled demo mode. Docker provisioning, real Discord credentials, live Stripe payments, and remote-node operation need validation on your own infrastructure before accepting customers. See [Production guide](docs/PRODUCTION.md) and [Verification](docs/VERIFICATION.md).

## One-command GitHub Codespaces install

Open this repository in a GitHub Codespace. The included `.devcontainer/devcontainer.json` runs the installer automatically and forwards port **3000** as a private port. You can also run it manually in the Codespace terminal:

```bash
bash install.sh
```

The installer installs Node.js 22 locally when needed (with checksum verification), installs locked npm dependencies, builds the panel, creates a persistent local session secret, and starts the panel. It does not require sudo or delete existing data. Re-running it preserves the environment and does not reset an existing administrator password.

**Development login:** `admin` / `admin123` (email alternative: `admin@zk.local`).

> This shortcut is explicitly development-only. Change the password in Settings before sharing access, keep the forwarded port **Private**, and never reuse this database/credentials for production. Docker/production mode refuses the bootstrap shortcut. The Codespace runs demo compute, not real game hosting.

Useful commands:

```bash
bash install.sh --no-start     # install/build/bootstrap only
bash install.sh --start-only   # start in background; log: data/codespace.log
npm run admin:bootstrap-dev    # explicit development bootstrap (guarded)
```

Stop a background Codespace panel with `kill "$(cat data/codespace.pid)"`. The installer-generated `.env.codespace`, local Node toolchain and runtime data are ignored by Git.

## Explore locally

Requires **Node.js 22.13+** and npm. Linux is required for the descriptor-anchored workspace file operations.

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**. The demo signs into a seeded administrator workspace automatically. No Docker daemon, payment account, or bot token is needed.

The demo includes six deployments, three fictional regions, a prepaid wallet, console output, plugin metadata, real workspace files and archives, schedules, and editable Autopilot policies. It does **not** start game processes, execute real Minecraft commands, install executable plugins, measure real compute, or charge money.

### Commands

| Command                            | Purpose                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                      | API + Vite development server, port 3000                                       |
| `npm test`                         | API, filesystem, security, ZIYN, payment-signature and production-gating tests |
| `npm run typecheck`                | Strict TypeScript checks across the entire project                             |
| `npm run build`                    | Frontend plus bundled panel, agent, bot and command registration               |
| `npm start`                        | Serve the built panel; configure production environment first                  |
| `npm run test:ui`                  | Playwright desktop/mobile and deployment workflow checks                       |
| `npm run admin:create`             | Interactive administrator creation with hidden password input                  |
| `npm run ziyn:import -- file.json` | Import a disabled ZIYN or legacy template for review                           |
| `npm run bot:register`             | Register Discord slash commands using your application credentials             |
| `npm run bot`                      | Start the Discord companion                                                    |
| `npm run agent`                    | Start a node agent; intended for a dedicated Docker host                       |

## What is included

- **Workspace:** responsive dashboard, deployment search/filters, global search, notifications, activity, account settings and API keys.
- **Deployments:** guided ZIYN selection, resource plans, region selection, startup validation, wallet debit, provisioning state, power actions, renewal and confirmed deletion.
- **Minecraft:** Paper, Purpur, Fabric, Forge, NeoForge, Vanilla, Spigot, Bedrock and Velocity ZIYNs; version/startup settings; itzg automatic JAR installation in Docker mode; console; Modrinth plugin compatibility and checksum verification; world files and backups.
- **Other workloads:** Rust/Valheim community-image ZIYNs, Node/Python bots, static/Node websites, Alpine/Ubuntu containers and Redis. Community images are disabled in Docker mode until explicitly approved.
- **Files:** browsing, text editing, create/rename/delete, upload/download, traversal protection, descriptor-anchored opens, per-workspace mutation locks and upload quotas.
- **Backups:** real compressed workspace archives, SHA-256 checksums, download, stopped restore, archive validation, staging and rollback. Minecraft live backups request world-save flushing.
- **Autopilot:** crash-recovery attempts with a circuit breaker, scheduled backups with failure backoff, optional low-activity sleep, and monthly plan-cost threshold notifications.
- **Billing:** INR prepaid plans, transactional wallet ledger, deployment refunds on provisioning failure, renewal, Stripe Checkout and signed/idempotent webhook settlement. Receipts are wallet receipts, **not tax invoices**.
- **Administration:** users, suspension/role/credit controls, nodes, deployment overview and ZIYN import/approval/export.
- **Discord:** `/zk link`, `list`, `status`, `start`, `stop`, `restart`, `backup`, and `command`, with account linking, ownership checks, autocomplete and ephemeral responses.

## ZIYN, not eggs

A ZIYN describes a runtime image, startup/stop commands, allocation port/protocol, validated variables, secrets, metadata and workload category. Native exports use `ZIYN_v1`. The importer also reads legacy `PTDL_v1`/`PTDL_v2` definitions, but **never imports or executes their installation scripts**. Every imported template is disabled until an administrator reviews its image, command, variables and license.

ZIYN is a native format, not a claim that every Pelican template is binary-compatible. See [ZIYN guide](docs/ZIYN.md).

## Architecture

```text
React / Vite ── same-origin API ── Express + SQLite
                                      │
                         demo runtime │ Docker runtime
                                      ├── local Docker socket (dedicated host)
                                      └── HTTPS node agent ── Docker workloads
                                      ├── Stripe Checkout + signed webhook
                                      └── Discord companion (shared data volume)
```

The public panel Compose file does **not** mount the Docker socket. The optional agent Compose file is for a separate, dedicated Docker host behind TLS. Docker socket access is root-equivalent; a token does not make it safe to expose directly to the internet.

## Configuration and deployment

Copy `.env.example` to `.env` and follow the [Production guide](docs/PRODUCTION.md). Docker mode requires a strong `SESSION_SECRET` and never silently falls back to demo behavior. Real Stripe/Discord operation requires your own credentials.

```bash
# Public panel, remote-node-only mode
docker compose up --build -d
docker compose exec panel node --import tsx scripts/create-admin.ts

# Optional Discord companion (same data volume)
docker compose --profile discord up --build -d bot
```

The supplied images and Compose configurations have not been built or exercised in the development sandbox because Docker is unavailable there. Treat them as deployment starting points and run the acceptance checklist before public use.

## Scope and reference policy

This is a native, interoperable TypeScript implementation, not a literal merge of PHP, Rust and Node backends. The requested projects informed workflows and architecture; copying incompatible backends wholesale would not produce a coherent or safely licensed panel. No JTG or Mpanel backend source is vendored. Reference attributions and licensing notes are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Not included in v0.1: SFTP, subuser permissions, automatic custom-domain/TLS routing, a modpack browser, tax-compliant invoicing, distributed database replication, object-storage backups, or a hardened multi-tenant kernel boundary. CPU/RAM/Docker process limits are implemented; filesystem quotas are enforced by panel operations, **not** by a kernel/filesystem quota on arbitrary container writes.

## Verification

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for executed checks and explicit untested boundaries. Generated runtime state lives in ignored `data/`; never publish that directory, `.env`, API keys, node tokens or the SQLite database.
