# Third-party notices and reference attribution

ZK PANEL's application implementation is native TypeScript/React. The projects below were studied for workflows and architecture; their entire backends are not vendored or merged. Names remain the property of their respective owners. No endorsement is implied.

## Pelican eggs / Pterodactyl eggs

Repository: https://github.com/pelican-eggs/eggs

The legacy template importer was informed by the public PTDL JSON structure. The repository's MIT notice reads:

> MIT
>
> Copyright (c) 2018 Michael Parker <parker@parkervcp.com> and Contributors

The catalog contains native ZIYN definitions and references to community runtime images; it does not bundle Pelican installation scripts or server binaries. Preserve upstream notices when adapting actual upstream definitions in the future.

## Pterodactyl Panel

Repository: https://github.com/pterodactyl/panel

MIT license: **Pterodactyl® — Copyright © Dane Everitt <dane@daneeveritt.com> and contributors**.

Allocation/provisioning rollback, template validation and panel/daemon separation informed the architecture. Pterodactyl's PHP backend and Wings daemon are not copied into this project.

## Calagopus

Repository: https://github.com/calagopus/panel

MIT license: **Copyright (c) Calagopus, 0x7d8**.

Used as an architectural reference for panel/node separation. Its Rust backend is not vendored.

## AMC PANEL

Repository: https://github.com/AyushTheWarriorOfficial/AMC-PANEL

The fetched repository declares MIT, **Copyright (c) 2026 AyushTheWarrior**. Used as a Minecraft workflow reference. Its upstream README also requests linking the creator when modifying/forking; this notice provides attribution, but no AMC source is included.

## JTG and Mpanel

Repositories:

- https://github.com/JishnuTheGamer/Jtg
- https://github.com/nobita329/Mpanel

Used only as public workflow/product references. At inspection, JTG had no clear root reuse license; Mpanel's package declared MIT but a root license was not found. No backend source from these projects is copied or redistributed. Obtain explicit permission/license clarification before reusing their code.

## MIT permission text applicable to the above MIT notices

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Other components

React, Vite, Express, SQLite's Node runtime, Dockerode, Stripe, Discord.js, Zod, Recharts, Lucide, tar and other npm dependencies retain their own licenses in their packages. DM Sans and Space Grotesk are distributed through Fontsource under their font licenses. The voxel hero artwork was generated for this project; no reference-panel artwork is included.

Runtime images (itzg, Node, Python, Nginx, Redis, Alpine, Ubuntu and community game images) and downloaded Minecraft jars/plugins have separate upstream terms. Review them before commercial hosting or redistribution. Minecraft customers must accept Mojang's EULA.
