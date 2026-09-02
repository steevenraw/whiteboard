<!--
  - SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Nextcloud Whiteboard

[![REUSE status](https://api.reuse.software/badge/github.com/nextcloud/whiteboard)](https://api.reuse.software/info/github.com/nextcloud/whiteboard)

The official whiteboard app for Nextcloud. Create and share whiteboards with real-time collaboration.

---

## À propos de ce fork

Ce dépôt est un **fork personnel patché** de [`nextcloud/whiteboard`](https://github.com/nextcloud/whiteboard),
basé sur le tag `v1.5.9`. Il ajoute des fonctionnalités inspirées de Miro que
l'app officielle n'a pas nativement. Le code patché vit sur la branche
[`patch/miro-features`](https://github.com/steevenraw/whiteboard/tree/patch/miro-features)
(la branche `main` reste un miroir identique de l'amont, ne pas y toucher).

### Ce qui est patché

**Panier A** — sans risque, s'appuie uniquement sur des API publiques d'Excalidraw déjà utilisées ailleurs dans le code :
- Traductions françaises complétées (Vote, Minuteur, Grille, Recherche de texte — restées en anglais dans l'app officielle).
- Vote / Minuteur / Présentation / Enregistrement promus en icônes visibles dans la barre d'outils principale (auparavant cachés dans le menu ☰ ; les deux chemins cohabitent).
- Post-it en un clic (rectangle + texte lié, natif Excalidraw).

**Panier B** — plus profond, ajoute un vrai composant React (`src/components/RichStickyNote.tsx`) :
- Le post-it devient un élément *embeddable* rendu comme un vrai `<div contenteditable>` DOM (pas un élément texte natif Excalidraw — celui-ci n'a pas de notion de segments stylés, gras/souligné sur une sélection partielle est structurellement impossible dessus).
- Mise en forme sur sélection : gras, souligné, taille agrandie, couleur de texte.
- Taille (S/M/L) et couleur de fond (8 couleurs) du post-it, via une mini-barre d'outils custom (les embeddables n'ont pas accès au panneau de propriétés natif d'Excalidraw).

**Compromis assumé** : un post-it "riche" (panier B) n'apparaît PAS dans l'export
image natif d'Excalidraw ("Exporter l'image…", capture d'écran) — Excalidraw
remplace tout élément embeddable par un placeholder générique à l'export,
comportement natif non contournable sans réécrire son pipeline d'export.
Solution de repli : capture d'écran du navigateur.

### Fichiers modifiés

| Fichier | Rôle |
|---|---|
| `src/hooks/useQuickTools.tsx` | Nouveau : boutons de la barre d'outils rapide (post-it, vote, minuteur, présentation, enregistrement) |
| `src/components/RichStickyNote.tsx` | Nouveau : rendu DOM du post-it à texte riche (panier B) |
| `src/App.tsx` | Distingue le post-it riche (`customData.whiteboardNoteType`) des embeddables existants (cartes de référence Nextcloud) sur le même point d'extension `renderEmbeddable` |
| `l10n/fr.json`, `l10n/fr.js` | Traductions françaises complétées |

### Piège technique à retenir (barres flottantes)

Les barres flottantes du post-it riche (formatage, taille/couleur) sont
rendues via `createPortal()` — **jamais vers `document.body`**. Deux raisons,
documentées en commentaire dans `RichStickyNote.tsx` :
1. La note et le conteneur embeddable natif d'Excalidraw ont chacun leur
   propre `overflow:hidden` : toute barre positionnée pour dépasser de la
   note (au-dessus) est rognée si elle reste dans cet arbre.
2. React 18 délègue ses événements sur le conteneur racine passé à
   `createRoot()`, pas sur `document`. Si le portail cible `document.body`
   (un ANCÊTRE de ce conteneur, pas un descendant), les clics natifs ne
   traversent jamais le conteneur racine — React ne les voit jamais, le
   bouton reste géométriquement correct mais totalement inerte. Piège
   invisible en lecture de code, uniquement détectable en testant un clic
   réel de bout en bout.

La fonction `findPortalTarget()` cible le parent du wrapper Excalidraw
(`.App`) — à la fois dans l'arbre React (délégation OK) et au-dessus des
`overflow:hidden` (affichage/clic OK).

### Build & déploiement (sur un serveur Unraid, conteneur linuxserver)

```bash
# 1. Build (conteneur Node.js, ~1 min)
docker run --rm -v /chemin/vers/ce/depot:/build -w /build node:24 npm run build

# 2. Backup de l'app en prod AVANT tout déploiement
tar -czf whiteboard-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /chemin/app/prod .

# 3. Déployer UNIQUEMENT les dossiers régénérés par le build
#    (ne pas toucher lib/, vendor/, appinfo/, img/, templates/)
rm -rf /chemin/app/prod/{js,dist}
cp -r js dist /chemin/app/prod/
chown -R 1000:1000 /chemin/app/prod/{js,dist}
```

**Piège de cache** : `whiteboard-main.mjs` (point d'entrée) et `l10n/*.js`/`*.json`
ont un nom de fichier stable (pas de hash de contenu comme les autres chunks
Vite) — un cache navigateur ou CDN en façade peut servir une version périmée
même après déploiement réel. Toujours vérifier avec un rechargement forcé
(Ctrl+Shift+R) dans un nouvel onglet.

Le serveur websocket temps réel (`nextcloud-whiteboard-server`, image
`ghcr.io/nextcloud-releases/whiteboard:stable`) est un déploiement séparé,
non concerné par ce patch (c'est le backend collab, pas le frontend Excalidraw).

### Gérer les mises à jour amont

Ce fork ne suit PAS automatiquement `nextcloud/whiteboard` — pas d'obligation
de récupérer chaque nouvelle version. Mettre à jour seulement si une raison
concrète apparaît (faille de sécurité, fonctionnalité upstream réellement
voulue). Marche à suivre le moment venu :

1. Récupérer l'amont : bouton **"Sync fork"** sur la branche `main` de ce
   dépôt GitHub (ou `git fetch upstream` si l'amont est ajouté comme remote
   en local), pour que `main` reste un miroir à jour de `nextcloud/whiteboard`.
2. Sur `patch/miro-features` : `git merge main` (pas de rebase — cette
   branche est déjà poussée sur GitHub, un rebase forcerait un
   force-push sans bénéfice réel pour un fork à un seul contributeur).
3. Résoudre les conflits attendus, par ordre de risque :
   - `l10n/fr.json` / `l10n/fr.js` — le plus probable (le bot Transifex
     amont les régénère à chaque release). Réappliquer les clés custom
     de ce fork si écrasées (liste dans le commit "Panier A").
   - `src/App.tsx` — diff minuscule (1 import, 1 fonction, 1 prop), conflit
     peu probable et facile à relire à la main si ça arrive.
   - `src/hooks/useQuickTools.tsx`, `src/components/RichStickyNote.tsx` —
     fichiers propres à ce fork, aucun risque de conflit sauf si l'amont
     crée un fichier de même nom (très improbable).
4. Rebuild + redéployer (voir section précédente) après résolution.
5. Tester en conditions réelles avant de considérer la mise à jour terminée
   (créer un post-it, vérifier gras/souligné/taille/couleur) — les bugs de
   ce patch sont du genre qui ne se voit qu'à l'usage réel, pas à la lecture
   du code (barres flottantes invisibles, clics morts).

---

## Features

- 🎨 Drawing shapes, writing text, connecting elements
- 📝 Real-time collaboration with semi-offline support
- 💾 Client-first architecture with local storage
- 🔄 Automatic sync between local and server storage
- 🌐 Works semi-offline - changes saved locally and synced when online (websocker server configured successfully)
- 💪 Built on [Excalidraw](https://github.com/excalidraw/excalidraw)

## Architecture

Nextcloud Whiteboard uses a **client-first architecture** that prioritizes browser-based functionality:

- **Browser-First**: All whiteboard functionality works directly in the browser
- **Local Storage**: Changes are immediately saved to browser storage (IndexedDB)
- **Real-time Collaboration**: WebSocket server handles live collaboration sessions
- **Simplified Connectivity**: Only browsers need to connect to the websocket server
- **Reduced Dependencies**: Websocket server is only needed for real-time collaboration, not basic functionality

## Installation & Setup

### WebSocket Server for Real-time Collaboration

The websocket server handles real-time collaboration sessions between users. **Important**: The websocket server is only needed for live collaboration - basic whiteboard functionality works without it.

#### Connectivity Requirements

**Essential (for real-time collaboration):**
- User browsers need HTTP(S) access to the websocket server
- Nextcloud and websocket server share a JWT secret for authentication

#### Configuration

Configure Nextcloud with the websocket server details: (Can be configured in the Nextcloud admin settings)

```bash
occ config:app:set whiteboard collabBackendUrl --value="https://nextcloud.local:3002"
occ config:app:set whiteboard jwt_secret_key --value="some-random-secret"
```

### Running the WebSocket Server

#### Node.js

```bash
npm ci
JWT_SECRET_KEY="some-random-secret" NEXTCLOUD_URL=https://nextcloud.local npm run server:start
```

#### Docker

```bash
docker run -e JWT_SECRET_KEY=some-random-secret -e NEXTCLOUD_URL=https://nextcloud.local -p 3002:3002 --rm ghcr.io/nextcloud-releases/whiteboard:stable
```

Or using Docker Compose:

```yaml
services:
  nextcloud-whiteboard-server:
    image: ghcr.io/nextcloud-releases/whiteboard:stable
    ports:
      - "3002:3002"
    environment:
      NEXTCLOUD_URL: https://nextcloud.local
      JWT_SECRET_KEY: some-random-secret
```

**Environment Variables:**
- `JWT_SECRET_KEY`: Must match the secret configured in Nextcloud
- `NEXTCLOUD_URL`: Used for JWT token validation and optional recording uploads
- `RECORDINGS_DIR`: Optional writable directory for temporary recording files (defaults to `/tmp/whiteboard-recordings` in the Docker image and automatically falls back to the OS temp directory if unavailable)
- `RECORDING_DISCONNECT_GRACE_MS`: Grace period before stopping a recording after the recorder disconnects (default: `5000`)
- `HOST`: Optional definition of the listening interface (defaults to `0.0.0.0`).

### Recording prerequisites

Board recordings require a headless Chromium browser and [ffmpeg](https://ffmpeg.org/) on the collaboration server. The system automatically detects Chrome installations:

- **Self-hosted**: Auto-detects Chrome/Chromium in standard locations
- **Docker**: Uses bundled Alpine Chromium package
- **Custom paths**: Set `CHROME_EXECUTABLE_PATH` environment variable

**Quick Setup**

**Docker (Recommended)**
```bash
# No setup needed - Chromium is pre-installed
docker run -e JWT_SECRET_KEY=some-random-secret -p 3002:3002 --rm ghcr.io/nextcloud-releases/whiteboard:stable
```

**Self-hosted Systems**
```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y chromium chromium-common

# Alpine Linux  
apk add --no-cache chromium nss freetype harfbuzz ttf-freefont

# macOS (install Chrome via Homebrew or download from google.com/chrome)
brew install --cask google-chrome

# Verify installation
chromium-browser --version  # Linux
google-chrome --version     # macOS/Chrome
```

**Advanced Configuration**
```bash
# Override auto-detection (for custom Chrome locations)
export CHROME_EXECUTABLE_PATH="/path/to/your/chrome"
npm run server:start
```

The server performs automated Chrome detection on startup and before each recording. If Chrome isn't found, users receive clear error messages with installation guidance. Temporary recording data is written to the directory specified by `RECORDINGS_DIR` (or `/tmp/whiteboard-recordings` in the official Docker image). If that location cannot be created or written, the server falls back to the operating system temp directory automatically and logs a warning. After installing Chrome, restart the websocket server to apply changes.

## Reverse Proxy Configuration

If running the websocket server manually, configure your reverse proxy to expose it:

<details>
<summary>Apache Configuration</summary>

**Apache >= 2.4.47:**
```apache
ProxyPass /whiteboard/ http://localhost:3002/ upgrade=websocket
```

**Apache < 2.4.47:**
```apache
ProxyPass /whiteboard/ http://localhost:3002/
RewriteEngine on
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/?whiteboard/(.*) "ws://localhost:3002/$1" [P,L]
```
</details>

<details>
<summary>Nginx Configuration</summary>

```nginx
location /whiteboard/ {
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_pass http://localhost:3002/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```
</details>

<details>
<summary>Other Reverse Proxies</summary>

**Caddy v2:**
```caddy
handle_path /whiteboard/* {
    reverse_proxy http://127.0.0.1:3002
}
```

**Traefik v3:**
```yaml
- traefik.http.services.whiteboard.loadbalancer.server.port=3002
- traefik.http.middlewares.strip-whiteboard.stripprefix.prefixes=/whiteboard
- traefik.http.routers.whiteboard.rule=Host(`nextcloud.example.com`) && PathPrefix(`/whiteboard`)
- traefik.http.routers.whiteboard.middlewares=strip-whiteboard
```
</details>

## WebSocket Server Configuration

The websocket server handles real-time collaboration sessions (not critical whiteboard data):

### Collaboration Data Storage

**LRU Cache (Default)**
- In-memory session storage, simple setup
- Suitable for most deployments
- Session data cleared on restart (whiteboard data remains safe in Nextcloud/local storage)

```bash
STORAGE_STRATEGY=lru
```

**Redis**
- For multi-server setups or session persistence
- Enables horizontal scaling with Redis Streams

```bash
STORAGE_STRATEGY=redis
REDIS_URL=redis://[username:password@]host[:port][/database_number]
```

### Scaling (Optional)

For high-traffic environments with multiple websocket servers:

1. Use Redis for shared session state
2. Configure load balancer with session stickiness
3. Redis Streams handles WebSocket scaling automatically
4. Redis is required for multi-node clusters; socket and room session keys use TTLs instead of global clears so restarting a node does not erase active state on its peers

## Benchmarking & Capacity Planning

To size dedicated collaboration servers we profiled the websocket backend with the synthetic load harness in `tools/benchmarks/`. The `runBenchmarks.mjs` script boots the production server (TLS disabled, LRU cache) and spawns JWT-authenticated Socket.IO clients from `loadTest.mjs`. Each run holds a room open for 60 seconds, with 10% of participants sending cursor and viewport updates at 2 Hz to mimic active sketching while the rest stay idle.

**Test environment**
- Apple M4 (10 logical cores, 16 GB RAM), Node v24.8.0
- Single websocket process, `NODE_OPTIONS=--max-old-space-size=8192`, `STORAGE_STRATEGY=lru`
- Aggregate ingress/egress recorded from client telemetry (`nettop` requires root on macOS)
- Full JSON results are stored in `tools/benchmarks/results.json`

**Observed highlights**
- Per-user CPU hovered around 0.2% for small teams and climbed to ~0.37% at 300 concurrent users.
- Memory footprint stayed near 5 MB/user at 50 users and ~10 MB/user at 300 users.
- Server egress reached ~3 Mbps (50 users), ~13 Mbps (100 users) and ~366 Mbps (300 users). Pushing to 500 synthetic users drove ~1.2 Gbps and the single process began dropping ~30% of sockets.

**Key takeaways**
- Expect roughly 0.2% CPU per connected collaborator; reserve additional headroom for presenters or rapid drawing.
- Budget ~5–10 MB of process RSS per user when running in a single-node, in-memory configuration.
- Throughput scales quickly with active senders—plan outbound bandwidth over-provisioning (≥15 Mbps / 100 users) when presentations or screen follow are frequent.

| Concurrent users | Avg CPU (10-core test rig) | Avg RSS | Server egress (60 s run) | Recommended spec |
| --- | --- | --- | --- | --- |
| 50 | ~10% (~0.21% per user) | ~0.24 GB | ~23.5 MB total (≈3.1 Mbps) | 2 vCPU / 1 GB RAM |
| 100 | ~20% (~0.20% per user) | ~0.36 GB | ~96.6 MB total (≈12.9 Mbps) | 4 vCPU / 2 GB RAM |
| 500* | ~203% (≈2 cores) | ~3.6–4.5 GB | ~9.2 GB total (≈1.2 Gbps) | ≥8 vCPU / ≥8 GB RAM per node + Redis + ≥2 nodes |

\*500-user test saturated a single instance and dropped ~30% of simulated clients. Treat this as an upper bound and plan to run multiple websocket workers behind a sticky load balancer with `STORAGE_STRATEGY=redis`.

### Run the benchmark locally

1. Install dependencies: `npm ci` (and `composer install` if you have not bootstrapped the PHP side yet).
2. Ensure the websocket server can start without TLS (set `TLS=false` or export `TLS=false` before running the script) and that `JWT_SECRET_KEY`/`NEXTCLOUD_URL` are configured for your environment.
3. Execute `node tools/benchmarks/runBenchmarks.mjs` to run the default scenarios (50, 100, 300 concurrent users).
4. Adjust load with environment variables as needed:
   - `LOAD_TEST_CONCURRENCY=50,150,300` to pick specific cohorts (comma separated).
   - `LOAD_TEST_ACTIVE_RATIO=0.15` to vary the percentage of active broadcasters.
   - `LOAD_TEST_RATE=3` to control per-sender update frequency (messages/sec).
   - `LOAD_TEST_DURATION=90` to lengthen each run.
5. After each execution the summarized telemetry is printed to stdout and saved to `tools/benchmarks/results.json`; keep copies per hardware profile for future comparisons.
6. When testing in prod-like environments, monitor OS-level CPU/RAM/network metrics in parallel (e.g., `top`, `sar`, cloud dashboards) to validate the Node-level sampling.

**Recommendations**
- Keep `NODE_OPTIONS=--max-old-space-size=8192` (or higher) when targeting 300+ concurrent users to avoid heap exhaustion.
- For 300+ users, switch to Redis-backed storage and deploy at least two websocket instances to spread load.
- Budget at least 15 Mbps outbound bandwidth for every 100 concurrently connected users; architecturally heavy sessions (live presenting, rapid drawing) can double that figure.
- Re-run `node tools/benchmarks/runBenchmarks.mjs` after feature changes or on target hardware to validate sizing before production rollout.

## Troubleshooting

### Connection Issues

**Real-time Collaboration Not Working**
- Verify JWT secrets match between Nextcloud and websocket server
- Check that user browsers can access the websocket server URL
- Ensure reverse proxy correctly handles WebSocket upgrades
- Check browser console for connection errors

### Known Issues

**Legacy Integration App Conflict**
If you previously had `integration_whiteboard` installed, remove any whiteboard entries from `config/mimetypealiases.json` and run:
```bash
occ maintenance:mimetype:update-db
occ maintenance:mimetype:update-js
```

**Misleading Admin Errors**
Admin connectivity checks may show false negatives in Docker/proxy environments. These errors don't affect actual functionality since the architecture is client-first. Focus on browser-based connectivity tests instead.

## Development

To build the project locally:

```bash
npm ci
npm run build
```

For development with hot reload:
```bash
npm run watch
```

To run the websocket server in development:
```bash
npm run server:watch
```
