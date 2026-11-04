# Production deployment and security guide

## Read this first

ZK PANEL v0.1 is a working application foundation, not a security-certified commercial hosting platform. The development preview is a simulation. The Docker runtime, agent image, panel image, real Discord bot and live Stripe checkout have not been end-to-end tested in the supplied sandbox. Do not equate a successful TypeScript build or demo test with production readiness.

Use dedicated Linux nodes for untrusted workloads. Never run customer containers on a workstation, a database server, or a machine containing unrelated secrets. Docker's default shared-kernel boundary is not equivalent to a VM boundary.

## Development credentials are not production credentials

`install.sh` can create `admin` / `admin123` only for an explicitly enabled demo/development workspace. Docker mode refuses this bootstrap. Never copy a Codespace database into production, never expose the default development password publicly, and use `npm run admin:create` with a unique password for a real deployment.

## 1. Prepare the panel

1. Install Node.js 22.13+ or Docker Engine with Compose on a Linux host.
2. Copy `.env.example` to `.env`; keep it outside public source control.
3. Generate a secret with `openssl rand -hex 48` and set `SESSION_SECRET`.
4. Set `ZK_MODE=docker`, `PUBLIC_URL=https://panel.example.com`, and `COOKIE_SECURE=true`.
5. Leave `ALLOW_REGISTRATION=false` until authentication, abuse controls and billing have been reviewed.
6. Keep `ZK_REMOTE_ONLY=true` for the public panel. The supplied `compose.yaml` enforces this and does not mount a Docker socket.
7. Build/start the panel: `docker compose up --build -d`.
8. Create the first administrator interactively: `docker compose exec panel node dist/scripts/create-admin.mjs`. The production image includes the bundled administrator CLI; alternatively run `npm run admin:create` from a source checkout with the same persistent DATA_DIR. Never pass a password as a command-line argument.
9. Put Nginx/Caddy or another TLS reverse proxy in front of the loopback-bound panel. Forward Host and X-Forwarded-Proto. Restrict direct access to port 3000. The application trusts one proxy hop; do not expose it behind an arbitrary proxy chain.
10. Verify `/healthz`, sign in, and confirm the UI does not say demo mode.

The panel uses SQLite WAL on a local persistent volume. Run one panel writer per database. Do not place SQLite on NFS or scale panel replicas against the same file. The bot may share the local volume in the supplied single-host Compose arrangement. Back up the database using SQLite's backup API or stop the panel and bot before a filesystem copy; include `-wal` if copying a live database is unavoidable.

## 2. Prepare a dedicated node

1. Install Docker Engine on a separate Linux machine with a supported filesystem and sufficient disk/RAM.
2. Create a workspace directory, for example `/opt/zk/workspaces`. Set `WORKSPACE_HOST_PATH` to that **real host path**.
3. Generate a unique `NODE_TOKEN` with `openssl rand -hex 32`. Generate a separate agent `SESSION_SECRET`.
4. Review `IMAGE_ALLOWLIST`. Only approved, reviewed images should be listed. Pin reviewed image digests for a real service; mutable tags are not a supply-chain guarantee.
5. Start `compose.agent.yaml` on the node. Its API binds to host loopback port 8080. Put TLS in front using a reverse proxy or a private tunnel. Do not publish the Docker socket or unprotected agent port.
6. In panel Administration → Nodes, register the HTTPS agent URL and the **same existing NODE_TOKEN**. ZK verifies the token before saving the node; it does not invent a replacement token.
7. Run a node health check. Verify reported capacity, then create a small test deployment and exercise console, files, upload, backup, stopped restore, restart and deletion.

The agent intentionally has Docker socket access and runs as root to prepare UID-1000 workload ownership. Its token is therefore root-equivalent on that node. HTTPS, firewall rules, host isolation, secret rotation and host patching remain operator responsibilities. Agent URLs are administrator-controlled; do not grant administrator access to untrusted people.

General workloads run as UID 1000; static Nginx uses UID 101. Workloads receive CPU/RAM/PID limits, dropped capabilities and no-new-privileges. Minecraft/proxy data mounts at `/data`, static sites at `/usr/share/nginx/html`, Redis at `/data`, and other applications at `/home/container`. Review image-specific entrypoints and UDP requirements before approving a ZIYN.

## 3. Enable payments

1. Create a Stripe account and complete its business/KYC requirements.
2. Set `STRIPE_SECRET_KEY` on the panel only.
3. Create a webhook endpoint at `https://panel.example.com/api/webhooks/stripe` for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.expired`
   - `checkout.session.async_payment_failed`
4. Set `STRIPE_WEBHOOK_SECRET` from that endpoint and restart the panel.
5. Run a small real test transaction in an appropriately configured Stripe test environment. Verify the signed webhook, invoice status, wallet balance and replay behavior.

The browser never confirms a payment. The server matches session ID, invoice ID, owner, INR currency, amount and pending status before crediting. Event IDs and settled invoice status prevent duplicate credits. Never enable demo credit in Docker mode. Add your own tax, refund, accounting and legal policies; the built-in printable receipt explicitly is not a tax invoice.

## 4. Enable Discord

1. Create an application/bot in the Discord Developer Portal.
2. Invite it with `bot` and `applications.commands` scopes. Grant View Channels, Send Messages and Embed Links, not Administrator.
3. Set `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` on the panel. The bot needs the token and the same database/secret as the panel.
4. Register commands with `npm run bot:register`, then start `npm run bot`, or use `docker compose --profile discord up -d bot`.
5. In the panel, generate a ten-minute linking code and use `/zk link` in Discord. Test `/zk list`, status and a harmless command.

No Discord credentials were available during development. Credential-backed command delivery, permissions and gateway behavior must be tested before advertising this integration as live.

## 5. Operational acceptance checklist

- [ ] Panel and agent images build; containers restart cleanly.
- [ ] HTTPS, secure cookies, CSRF and reverse-proxy headers work on the actual preview/production origin.
- [ ] Registration policy, password reset/support process and administrator recovery are defined. Password reset email is not implemented in v0.1.
- [ ] Every enabled image is reviewed and pinned; imported ZIYN install scripts remain disabled.
- [ ] Minecraft EULA is accepted by the customer; JAR/version, console/RCON, plugins and world saves work for each offered runtime.
- [ ] Game UDP ports and any additional Valheim/Rust ports are configured and firewalled. The current allocator exposes one primary port per deployment; multi-port game images need additional runtime work.
- [ ] Website reverse-proxy/custom-domain routing is configured separately; deployment creation alone does not issue a domain or certificate.
- [ ] Filesystem/kernel disk quotas, inode limits, egress limits, backup storage quotas and image-layer/cache cleanup are enforced outside the panel. Panel upload/restore checks alone cannot stop a container from filling its disk.
- [ ] Backup consistency is tested for each database/game. Stop non-Minecraft applications before backing up. Archives are local, not offsite; configure encrypted offsite copies and retention.
- [ ] Autopilot is tested against deliberate crashes and intentional stops. Idle sleep uses CPU/player heuristics, not application-specific connection awareness; leave it off for latency-sensitive bots/services until validated.
- [ ] Node loss, expired prepaid terms, refunds, suspension and restart reconciliation are exercised.
- [ ] Real Stripe webhook retries and Discord ownership checks pass.
- [ ] Database/secret/workspace restoration is rehearsed. Losing SESSION_SECRET makes encrypted deployment/node secrets unreadable.
- [ ] Logs/metrics are shipped to durable monitoring; alerting, rate limits and abuse response are configured.
- [ ] An independent security review covers container escape risk, agent authentication, file races, archive extraction, dependency advisories and tenant isolation.

## Known boundaries

- No SFTP, subusers, email verification/password-reset delivery, automatic domain routing, modpack marketplace, or offsite backup provider.
- Node agents must be reachable from the panel; browser clients never contact agents directly.
- The runtime exposes one primary allocation. Multi-port games and proxy networks need explicit extension.
- Metrics are sampled, not a billing-grade time series. Player counts are not queried from real Minecraft servers in v0.1.
- Console uses Minecraft RCON or container stdin. Interactive TUIs and applications that do not read stdin are not full terminal sessions.
- File operations use Linux `/proc/self/fd` and no-follow directory descriptors. Run on Linux, not macOS/Windows, for production file isolation.
- Community game images are intentionally not approved by the default Docker allowlist.
- A deployment's panel disk quota is not a kernel quota. Backup limits are 5 archives, 500 MB per archive; restore expansion is checked against the deployment quota.
- The local demo is shared seeded state. Do not use it for private data or as a public multi-customer service.
