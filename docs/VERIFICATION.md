# Verification record

Verified on **4 November 2026** in the development workspace, using Node.js 22 and Linux.

## Executed checks

| Check                              | Result                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run typecheck`                | Passed                                                                                          |
| `npm test`                         | **35 passed, 0 failed**                                                                         |
| `npm run build`                    | Passed: frontend, panel, agent, Discord bot, command registration and both admin/import CLIs    |
| `npm run test:ui`                  | **4 passed, 0 failed** in Chromium                                                              |
| `npm audit --audit-level=moderate` | **0 vulnerabilities** at verification time                                                      |
| Built-in server smoke test         | `npm start` served the built frontend and `/healthz` on a separate port                         |
| Bundled administrator CLI          | Successfully created an administrator in an isolated Docker-mode database using test-only input |
| Demo API                           | Authenticated bootstrap, deployment, wallet, files, backup and restore checks passed            |

The browser tests use the supplied Chromium executable override in this sandbox. On a normal development machine, install a browser with `npx playwright install chromium` and run `npm run test:ui`. The tests exercise demo mode and mutate its workspace; use a disposable `DATA_DIR` when running against important data.

## Automated coverage

- Native ZIYN round trips, legacy PTDL mapping, disabled imports, image/variable/port validation and omission of legacy install scripts.
- Catalog uniqueness, all five workload categories and Minecraft EULA behavior.
- Salted password hashing and authenticated secret encryption.
- Workspace traversal/symlink rejection, file CRUD, binary download, real archive restore, malicious archive rejection, upload quotas and restore expansion quotas.
- Unauthenticated requests, cross-origin/CSRF rejection and tenant isolation.
- Atomic deployment wallet debit, EULA validation, provisioning state and confirmed deletion.
- Persisted demo console output, file upload/read/write, explicitly simulated plugin metadata, backup checksums/download and stopped restore.
- Autopilot policy updates, schedules, API-key creation/revocation and administrator restrictions for API keys.
- Stripe webhook signature rejection, signed settlement, event replay/duplicate-session protection, amount-mismatch rollback and expired checkout handling. **These are locally signed test events, not live Stripe transactions.**
- Docker-mode demo-login/registration/credit gating and agent bearer-token/allocation validation. **These do not start Docker workloads.**
- Browser rendering of principal panel pages, mobile navigation/viewport fit, signed-out real-mode login rendering, and a complete demo wallet → deployment → console → file → backup/restore → deletion workflow.

Additional manual browser checks covered plugin installation, API-key creation and the unconfigured Discord setup guide. No uncaught page exceptions were observed in the principal-page smoke test.

## Codespaces installer verification

- `bash -n install.sh` passed.
- The installer now requires a reachable Docker Engine, writes `ZK_MODE=docker`, uses a separate `data-real/` database/workspace, and refuses to start a demo fallback.
- The devcontainer adds the Docker-in-Docker feature; existing Codespaces must be rebuilt to pick it up.
- Automated tests verify username/email login, wrong-password rejection, disabled automatic demo login, demo bootstrap idempotency/refusal, and the separate real-mode Codespaces bootstrap (refuses demo mode, creates one admin, grants one internal wallet credit, and does not reset an existing password).
- A browser regression test verifies that an unauthenticated real-mode workspace renders the sign-in form instead of the boot error screen.
- The actual GitHub Codespaces provisioning lifecycle, Docker-in-Docker daemon, private-port forwarding and real workload execution were not exercised from this sandbox because Docker Engine is unavailable here; the configuration and runtime code are provided for that environment.

## Not verified / external requirements

- **Docker Engine is unavailable in this sandbox.** No real game/server/container process was provisioned. Dockerfiles and Compose files were not built or run. Image entrypoints, UID permissions, RCON/stdin, logs, networking, resource limits and runtime-specific behavior require acceptance testing on a dedicated host.
- **No live Stripe credentials:** no real checkout, payment, refund, tax or webhook delivery was tested.
- **No Discord credentials:** no gateway connection, slash-command delivery or real account-link round trip was tested.
- **No remote node deployment:** agent HTTP authentication/validation was tested locally, but not a panel-to-remote-agent TLS deployment or real remote workload lifecycle.
- No independent penetration test, container-escape assessment, load test, disaster-recovery drill or production SLA validation.
- Filesystem quotas enforced by panel operations are not kernel quotas on arbitrary container writes. Offsite backups, domain/TLS routing, SFTP, subusers and email/password-reset delivery are not implemented.

See [PRODUCTION.md](PRODUCTION.md) for the deployment checklist and limitations. A green test suite is evidence for the tested behaviors, not a claim that the entire hosting service is production-ready.
