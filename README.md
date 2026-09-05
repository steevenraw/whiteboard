<!--
  - SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Nextcloud Whiteboard

[![REUSE status](https://api.reuse.software/badge/github.com/nextcloud/whiteboard)](https://api.reuse.software/info/github.com/nextcloud/whiteboard)

The official whiteboard app for Nextcloud. Create and share whiteboards with real-time collaboration.

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

---

## À propos de ce fork (français)

Ce dépôt est un fork personnel de l'app officielle Nextcloud Whiteboard, maintenu
pour appliquer des patches non fusionnables en amont (fonctionnalités trop
spécifiques, ou correctifs de bugs découverts en usage réel). Branche `main` =
miroir de l'amont ; **`patch/miro-features`** = code réellement déployé en
production, à partir du tag `v1.5.9`.

### Patches appliqués (branche `patch/miro-features`)

| Commit | Contenu |
|---|---|
| `60ba5c3` Panier A | Post-it en un clic, Vote/Minuteur/Présentation/Enregistrement promus en icônes visibles dans la barre d'outils, traductions FR complètes du menu |
| `4c16954` Panier B | Post-it à texte riche (gras/souligné/couleur/taille) — implémenté en `embeddable` DOM (`src/components/RichStickyNote.tsx`), pas en élément texte natif Excalidraw (limite structurelle du moteur de rendu, voir historique de commit pour le détail des 8 bugs corrigés en le construisant) |
| `57ba525` | Fix sync serveur silencieuse : un conflit 409 (verrou distribué, collision transitoire) était traité comme un succès déguisé (`syncWorker.ts`), et le filet de sécurité à la fermeture d'onglet exigeait à tort d'être le "syncer désigné" (`useSync.ts`) — combinaison qui pouvait bloquer une sauvegarde serveur indéfiniment sans aucune erreur visible |
| `1a9a367` | Fix notification "Authentication Configuration Issue" qui restait affichée en permanence après un `jwt_secret_mismatch` détecté, même une fois la connexion réellement rétablie (`useCollaboration.ts`) |
| `3df39f6` | Fix crash total post-déploiement : `manualChunks: { vendor: [...] }` dans `vite.config.ts` empêchait ce chunk de voir son hash refléter les imports dynamiques qu'il embarque, laissant les navigateurs pointer vers un chunk supprimé après un nouveau build (page blanche). Retiré + bump systématique de version d'app pour un cache-busting fiable de bout en bout (voir procédure de déploiement ci-dessous) |

### Procédure de build et déploiement (patch local, pas de CI)

Le code réel en prod vit sur le serveur (Docker/Unraid), pas via le store
d'apps Nextcloud. Process complet pour tout futur patch :

1. Cloner/mettre à jour le clone serveur sur la branche `patch/miro-features`.
2. Patcher le code (`src/` pour le frontend React/TS, `lib/` pour le backend PHP,
   `websocket_server/` pour le serveur de collaboration Node — **ce dernier
   est bien dans ce dépôt**, ne pas supposer qu'il vit ailleurs).
3. **Toujours bumper `<version>` dans `appinfo/info.xml`** (4ᵉ chiffre, ex.
   `1.5.9.1` → `1.5.9.2`) — même pour un patch mineur. Sans ça, le fichier
   d'entrée `whiteboard-main.mjs` reste exposé au cache long terme du
   navigateur pour quiconque a déjà visité la page avant le déploiement (le
   paramètre `?v=` que Nextcloud appose sur ce fichier est un hash basé sur
   cette version déclarée, pas sur le contenu réel du fichier).
4. Build : conteneur `node:24`, `npm ci && npm run build` (~1min30).
5. **Backup de l'app en prod AVANT déploiement** (tar.gz du dossier complet).
6. Déployer UNIQUEMENT les dossiers régénérés par le build (`js/`, `dist/`,
   `css/`, `l10n/`) **et** `appinfo/info.xml` — ne jamais toucher `lib/`
   (PHP), `vendor/` (composer), `img/`, `templates/`. `chown` vers l'UID du
   conteneur Nextcloud (1000) après copie.
7. **Forcer la resynchronisation de la version côté Nextcloud** — écraser le
   fichier XML sur disque ne suffit pas, Nextcloud garde la version
   "installée" en base :
   ```bash
   docker exec -u abc nextcloud php /app/www/public/occ config:app:set \
     whiteboard installed_version --value='<nouvelle version>'
   ```
   Tant que ce n'est pas fait, `occ` refuse la plupart des commandes
   ("Nextcloud or one of the apps require upgrade") — sans que le site web
   lui-même soit affecté (`occ status` reste `maintenance: false`).
8. Vérifier en conditions réelles (pas juste "ça compile") : ouvrir le
   whiteboard, confirmer visuellement le rendu, vérifier l'absence
   d'erreurs console (`TypeError: Failed to fetch dynamically imported
   module` = symptôme du piège de cache ci-dessus revenu).
9. Ne jamais réintroduire de `manualChunks` nommé dans `vite.config.ts` sans
   retester spécifiquement qu'un changement d'un chunk qu'il référence
   dynamiquement fait bien changer son propre hash.

**Piège de transfert de fichiers Pandore ↔ PC Windows** : `scp` direct peut
être bloqué selon le contexte d'exécution ; `ssh <hôte> "cat > fichier" <
fichier_local` fonctionne, mais convertir les fins de ligne d'abord
(`tr -d '\r' < fichier_windows | ssh ...`) sous peine de voir tout le fichier
apparaître comme modifié dans `git diff` (CRLF vs LF), noyant le vrai diff.

### Note sur le test de connexion admin

La page `Réglages > Administration > Tableau blanc` peut afficher "Échec de
la vérification de la connexion : websocket error" même quand la
collaboration temps réel fonctionne parfaitement pour de vrais utilisateurs.
**C'est documenté comme un faux négatif connu par l'amont** (voir plus haut
dans ce README : *"Admin connectivity checks may show false negatives in
Docker/proxy environments... don't affect actual functionality"*) — cohérent
avec notre déploiement derrière Cloudflare. Ne pas chercher à "corriger" ce
test sans une vraie preuve que la collaboration réelle est cassée (logs du
conteneur `nextcloud-whiteboard-server` montrant de vraies connexions
utilisateur réussies = collaboration OK, indépendamment de ce que dit cette
page).

### Gérer les mises à jour amont

Pas de suivi automatique de `nextcloud/whiteboard` — mettre à jour seulement
sur raison concrète (sécurité, fonctionnalité voulue). Le moment venu :
"Sync fork" sur `main`, puis `git merge main` (pas de rebase, inutile pour un
fork mono-contributeur déjà poussé) sur `patch/miro-features`. Conflits
attendus par ordre de risque décroissant :
- `l10n/fr.*` (régénéré par le bot Transifex amont à chaque release)
- `src/hooks/useSync.ts`, `src/hooks/useCollaboration.ts`,
  `src/workers/syncWorker.ts`, `vite.config.ts` (patchés ci-dessus — vérifier
  si l'amont a corrigé les mêmes bugs différemment avant de réappliquer nos
  fix par-dessus)
- `src/App.tsx` (diff minuscule du panier A)
- Fichiers propres au fork (`useQuickTools.tsx`, `RichStickyNote.tsx`, risque
  quasi nul)
