# ZIYN deployment templates

ZIYN is ZK PANEL's native deployment-template format. It describes **what to run and how to configure it**, without executing an imported installation script.

## Native format

A native document contains `meta.version: "ZIYN_v1"` and the fields defined by `shared/ziyn.ts`:

```json
{
  "meta": { "version": "ZIYN_v1" },
  "id": "my-node-worker",
  "name": "Node worker",
  "kind": "bot",
  "description": "A reviewed Node.js background worker.",
  "version": "1.0.0",
  "author": "Your organization",
  "image": "node:22-alpine",
  "command": ["node", "index.js"],
  "stopCommand": "",
  "port": 3000,
  "protocol": "tcp",
  "variables": [
    {
      "key": "WORKER_NAME",
      "label": "Worker name",
      "default": "worker-01",
      "required": true,
      "rules": "^[a-z0-9-]{1,40}$"
    },
    {
      "key": "WORKER_TOKEN",
      "label": "Worker token",
      "default": "",
      "secret": true
    }
  ],
  "tags": ["Node.js", "Worker"],
  "color": "#bcf36b",
  "icon": "bot",
  "enabled": true,
  "source": "Your organization / native ZIYN",
  "features": ["Persistent workspace", "Live logs"]
}
```

`kind` is one of `minecraft`, `game`, `container`, `website`, or `bot`. Commands are argument arrays, not an interpolated host shell command. Environment values are passed to the container; only use shell evaluation inside an explicitly reviewed image/command. Secret-named values are encrypted at rest and redacted from normal deployment API responses.

## Import and review

From the administrator UI, paste a document, or run:

```bash
npm run ziyn:import -- ./my-worker.ziyn.json
```

Imports are **always disabled**, even if the document says `enabled: true`. Review:

1. Image provenance, digest, entrypoint, user and filesystem requirements.
2. Startup arguments and whether they invoke a shell.
3. Variable rules, required fields and secret handling.
4. Port/protocol and persistent mount requirements.
5. Resource needs, stop behavior, backup consistency and license.
6. Whether the image is present in the operator's `IMAGE_ALLOWLIST`.

Enable the reviewed template in Administration. Docker provisioning independently checks the exact image allowlist. Approval in the database is not a substitute for image review.

## Legacy templates

The parser accepts `PTDL_v1` and `PTDL_v2` JSON and maps the first image, startup, stop command and compatible variable definitions into a disabled container ZIYN. It does not copy installation scripts, Dockerfile snippets, entrypoint scripts or arbitrary config-file payloads. Legacy feature mappings, multi-image selection and install-time downloads require manual review.

This is a compatibility importer, not a complete Pelican runtime. In particular, a legacy template that depends on an install script will not be runnable until its installation workflow is implemented safely by the operator.

Administrators can export a native document from the panel. Keep the source attribution and license of any adapted definition. See `THIRD_PARTY_NOTICES.md` for the Pelican/Pterodactyl references.

## Minecraft JAR handling

The native Java Minecraft ZIYNs use `itzg/minecraft-server` with a `TYPE` environment value. In Docker mode the image downloads/selects the appropriate server JAR for the configured version. This is not a fake JAR rename: the actual image performs installation. The panel does not redistribute Mojang or third-party server binaries.

Fabric/Forge use their own mod workflows; the plugin manager only offers compatible plugin loaders. Bedrock and Velocity have different runtime behavior. The demo never downloads or executes these workloads.
