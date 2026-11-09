<p align="center">
  <img src="public/zk-studios-logo.png" alt="ZK STUDIOS logo" width="240" />
</p>

# ZK PANEL

**Made by ZK STUDIOS.**

**Your infrastructure, in control.** A unified hosting panel for Minecraft worlds, game servers, containers, websites, and bots.

ZK combines a charcoal-and-lime React interface with a TypeScript API, SQLite persistence, a Docker runtime, a dedicated-node agent, and a Discord companion. Its native **ZIYN** deployment templates replace the conventional egg workflow. **ZK Autopilot** adds per-deployment recovery, backup policies, optional idle sleep, and spending-threshold alerts.

> **Release status: functional v0.1 foundation, not an audited production hosting service.** The interactive preview runs in explicitly labelled demo mode. Docker provisioning, real Discord credentials, live Stripe payments, and remote-node operation need validation on your own infrastructure before accepting customers. See [Production guide](docs/PRODUCTION.md) and [Verification](docs/VERIFICATION.md).

## One-command GitHub Codespaces install

Open this repository in a GitHub Codespace. The included `.devcontainer/devcontainer.json` installs Docker-in-Docker, runs the installer automatically, and forwards port **3000** as a private port. If you already had an older Codespace, **rebuild the container** (Command Palette → “Codespaces: Rebuild Container”) so the Docker feature is installed. You can also run the installer manually in the Codespace terminal:

```bash
bash install.sh
```

The installer verifies that Docker Engine is reachable, installs Node.js 22 locally when needed (with checksum verification), installs locked npm dependencies, builds the panel, creates a persistent local session secret, bootstraps the administrator, and starts the panel in **real Docker mode**. It does not fall back to demo compute. Re-running it preserves the environment and does not reset an existing administrator password.

**Administrator login:** `admin` / `admin123` (email alternative: `admin@zk.local`). The account receives an internal wallet grant so you can launch real deployments without configuring Stripe first.

> Change this password in Settings before sharing access and keep the panel port **Private**. This bootstrap is an explicit Codespaces convenience, not a production credential policy. For a public/commercial deployment use `npm run admin:create` with a unique password and follow [Production guide](docs/PRODUCTION.md).

What is real in this mode:

- Minecraft deployments run the `itzg/minecraft-server` container image; the runtime downloads the real `server.jar` for the selected type/version and accepts the EULA only when you explicitly accept it.
- The plugin installer searches Modrinth, verifies the published SHA-512 hash, writes a real `.jar` into the deployment workspace, and removes it on uninstall. Restart the server to load/unload plugins.
- Console commands execute through RCON (`rcon-cli`) for Minecraft and through container stdin for other workloads; logs and resource metrics come from Docker.
- Files, backups, restores, power actions, schedules and Autopilot operate on the real container/workspace.

Codespaces limits: the Codespace can stop/sleep, has finite RAM/disk, and is not an always-on production hosting SLA. GitHub port forwarding is designed for web preview URLs; joining a Minecraft server from a game client may require a dedicated node or a TCP tunnel. The panel, JARs, plugins, console, files and backups are real inside the Codespace.

Useful commands:

```bash
bash install.sh --no-start          # install/build/bootstrap only
bash install.sh --start-only        # start in background; log: data/codespace.log
npm run admin:bootstrap-codespace   # explicit real-mode Codespaces bootstrap (guarded)
docker ps                           # inspect real workload containers
```

Stop a background Codespace panel with `kill "$(cat data/codespace.pid)"`. The installer-generated `.env.real`, local Node toolchain and `data-real/` runtime data are ignored by Git. Older demo data in `data/` is left untouched and is not used by the real runtime.

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
- **Minecraft:** Paper, Purpur, Fabric, Forge, NeoForge, Vanilla, Spigot, Bedrock and Velocity ZIYNs; version/startup settings; a JTG-inspired Java server properties editor (PvP, flight, command blocks and distances); itzg automatic JAR installation in Docker mode; console; Modrinth plugin compatibility and checksum verification; world files and backups.
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

### Minecraft versions and startup troubleshooting

Native Java Minecraft ZIYNs select an itzg Java image based on the requested version (Java 8 for older versions, Java 17 for 1.17–1.20.4, Java 21 for 1.20.5–1.21.x and Java 25 for newer year-based releases). Image selection is approximate; older mods and some server builds require different Java versions. The node's `IMAGE_ALLOWLIST` must include the selected image, including on remote agents. Existing installations with a custom allowlist must add the desired `itzg/minecraft-server:java8`, `java17`, `java21` and `java25` tags and restart the relevant service.

For Java servers, when you explicitly accept the Minecraft EULA in startup settings, ZK writes `eula=true` to the workspace EULA file. Existing servers are synchronized on their next start or restart; the panel does not accept the EULA for you.

The version field suggests releases from the upstream Paper, Purpur, Fabric, Forge, NeoForge, Spigot, Bedrock and Velocity providers. Bedrock suggestions use the community-maintained Bedrock-OSS archive. Provider access is required; if a lookup fails or the selected software is not yet supported, enter the version manually and verify it with the software provider. This list is not a guarantee that every version works with the configured Java image; older releases can require a different Java version.

In real Docker mode, open the deployment's **Console** to inspect output from the container, including output after a crash. Autopilot pauses after three unsuccessful recovery attempts instead of restarting indefinitely. A Docker container being marked running does not necessarily mean Minecraft has finished downloading its JAR or is ready to accept players. If Paper still fails, inspect the last console error, available RAM, disk space, image/network access and EULA; the exact cause cannot be determined without the server's logs. You can disable recovery in the deployment's Autopilot tab while investigating.

### Playit tunnel (local or remote Docker node)

The **Network → Playit tunnel** panel can start and stop a Playit agent for a Minecraft deployment on a local Docker node or configured remote node. It is administrator-only because a Playit agent can expose host-local services. The panel does not download or execute an unverified binary: install a trusted Playit agent from the [official Playit releases](https://github.com/playit-cloud/playit-agent/releases), verify it according to the provider's instructions, and set `PLAYIT_BINARY` to its absolute path in the panel environment. For a Codespace add `PLAYIT_BINARY=/absolute/path/to/playit` to `.env.real`, stop the panel, and run `bash install.sh --start-only`.

Start the agent from Network, open its claim link, and create a tunnel in your Playit account pointed at `127.0.0.1` and the deployment's allocated host port shown in the panel. Select TCP for Java Minecraft and UDP for Bedrock. The public join address is shown in Playit, not automatically returned by ZK PANEL. For a local node the agent runs on the panel host. For a remote node install the binary on that node, set `PLAYIT_BINARY` and `PLAYIT_HOST_NETWORK=true` in the node agent environment, and run the node agent on the actual Docker host network so `127.0.0.1` reaches the published deployment port. Do not set that flag for the default bridge-networked agent container. A host-networked node agent listens on the host: restrict its API with a firewall and authenticated TLS. Restart Playit from the panel after the panel or node agent restarts. Reset deletes the local credential; revoke the agent in Playit as well if it was compromised. Codespaces can sleep or stop.

Panel administrators can change public registration and per-user deployment limits in **Panel administration → Settings**. Changes apply to future operations. Runtime mode, secrets, and image approvals remain environment/host configuration.

The requested Pterodactyl VPS template is **not yet integrated**. Its PRoot installer, SSH credentials and multiport requirements need a dedicated compatibility and security review and real-host testing before enabling it. Do not expose a Docker socket or a VPS image to untrusted users as a substitute for a dedicated, properly isolated node.

### Subdomain DNS

Administrators can create DNS-only A/AAAA records in Network → Subdomain DNS, or display a record to enter manually at any DNS provider. Supply a public IP reachable from the internet, not a Codespaces web-forwarding hostname or a Playit address. For Cloudflare set `CLOUDFLARE_ZONE_NAME`, `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` in the panel environment and restart it. Use a token restricted to DNS edit for that zone. ZK refuses existing names and never overwrites them; delete or edit records at your DNS provider. Records are unproxied; DNS does not open ports, provide TLS, create a Playit tunnel, or configure HTTP routing. Connect using the allocated port; websites require a separately configured reverse proxy and TLS. DNS propagation and public node reachability are outside the panel's control.
