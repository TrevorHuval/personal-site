# Deploying trevorhuval.com and its apps

Verified against the four application workflows, the `trevorhuval-infra` stack,
and read-only checks on EC2 on September 18, 2026.

## How automatic is it?

**Builds and image publishing are automatic. Updating the live server is manual.**

```text
Local edits → commit → push to the release branch
                          ↓ automatic
                  GitHub Actions checks
                          ↓ if checks pass
                  Docker images → GHCR
                          ↓ manual deploy command
                  EC2 pulls the images
                          ↓ scripted
                  Compose recreates changed services
                          ↓ manual verification
                  Check public routes and app behavior
```

A commit alone does not trigger anything on GitHub. A green publishing workflow
means an image is available, not that the live container is using it. The `latest`
tag does not make a running container update itself.

| Step | Current automation |
| --- | --- |
| Commit and push | Manual |
| Tests, builds, publishing images | Automatic on the branch listed below |
| Pull images onto EC2 and replace containers | Manual invocation; deployment script handles the work |
| Caddy HTTPS certificate provisioning/renewal | Automatic when DNS and network access are correct |
| Restart exited containers / recover after host reboot | Configured with Docker startup and `restart: unless-stopped`; deliberately stopped containers stay stopped |
| Recover an unhealthy but still running container | Not provided by the restart policy |
| Database migrations | Startup migrations for Plannit and Heardit; MusiQL app-schema migration enabled by the stack |
| MusiQL catalog import/refresh | Manual ETL command |
| Database backups and off-host copies | Manual; a backup script exists |
| Production smoke tests, alerts, rollback | No automated release checks or rollback configured in the inspected workflows/scripts |

The live host had no updater container and no deployment-related systemd timer.
`crontab` was unavailable. This does not rule out automation configured outside
these repositories or an external service, but none was found in this inspection.

## Repositories, branches, and services

All four apps run on one EC2 host behind Caddy. Only Caddy publishes public
ports, 80 and 443. GitHub Actions builds AMD64 and ARM64 images; EC2 pulls the
appropriate image and does not compile source.

| App / public URL | Local folder under `C:/Users/huval/development/` | Release branch | Compose services / GHCR images |
| --- | --- | --- | --- |
| [Personal site](https://trevorhuval.com/) | `personalSite` | `main` | `site` → `ghcr.io/trevorhuval/personal-site` |
| [Heardit](https://trevorhuval.com/heardit) | `heardit` | `master` | `heardit` → `ghcr.io/trevorhuval/heardit`; database: `heardit-db` |
| [Plannit](https://trevorhuval.com/plannit) | `plannit` | `master` | `plannit` → `ghcr.io/trevorhuval/plannit` |
| [MusiQL](https://trevorhuval.com/musiql/) | `musiql` | `main` | `musiql-web`, `musiql-api`, `musiql-etl` → matching `ghcr.io/trevorhuval/` images; database: `musiql-db` |

Infrastructure lives separately in `C:/Users/huval/development/trevorhuval-infra`:
`docker-compose.yml`, `Caddyfile`, and `scripts/`. The deployed directory is
`~/trevorhuval-infra` on EC2.

The site workflow runs npm lint, tests, PDF checks, and a Docker build (which
also runs TypeScript and Vite). Heardit and Plannit publish after their .NET
build/tests pass. MusiQL publishes after both backend and frontend checks pass.
The three app repos also validate pull requests without publishing release
images. The site workflow supports manual **Run workflow**; the inspected app
workflows do not declare `workflow_dispatch`.

## Normal release

### 1. Commit and push the intended application changes

From the application repo, review `git status` and commit the intended files.
Then push its release branch:

```sh
# Personal site or MusiQL
git push origin main

# Heardit or Plannit
git push origin master
```

These are alternatives for the corresponding repo, not commands to run together.
Pushing a feature branch does not publish a release image under these workflows.

### 2. Wait for the publishing workflow for that exact commit

- [Personal site Actions](https://github.com/TrevorHuval/personal-site/actions): **Publish container image**.
- [Heardit Actions](https://github.com/TrevorHuval/Heardit/actions): **CI**, including **Publish image to GHCR**.
- [Plannit Actions](https://github.com/TrevorHuval/Plannit/actions): **CI**, including **Publish image to GHCR**.
- [MusiQL Actions](https://github.com/TrevorHuval/musiql/actions): **CI**, including **Publish images to GHCR**.

Wait for the entire publishing job. MusiQL publishes three images sequentially;
deploying partway through can mix versions. A failed build does not update the
running server, and a partial publishing failure can leave only some `latest`
tags updated. Resolve it before deploying.

### 3. Deploy to EC2

For an application-only update, SSH into the existing host and run:

```sh
cd ~/trevorhuval-infra
./scripts/deploy.sh
```

The script pulls active services' images, runs
`docker compose up -d --remove-orphans`, reloads Caddy, prunes dangling images,
and prints container status. It operates on the **whole stack**, including Caddy
and databases whose upstream image tags may have changed. It is not a rolling
deployment; replaced services can briefly be unavailable.

For infrastructure edits, or to deploy directly from your Windows computer,
use **Git Bash**, with the existing SSH settings in the gitignored
`scripts/server.env`:

```sh
cd /c/Users/huval/development/trevorhuval-infra
bash scripts/sync-to-server.sh
```

This copies the local Compose file, Caddyfile, `.env.example`, and server scripts
over SSH, then invokes the deploy script. It deploys the local infrastructure
files, including any uncommitted changes; review them first. It does not push
application source, wait for CI, or overwrite the server's real `.env`.

To update only a specific app on an already running stack, these are narrower
alternatives, run from `~/trevorhuval-infra` on EC2:

```sh
# Personal site only
docker compose pull site
docker compose up -d --no-deps site

# Heardit only
docker compose pull heardit
docker compose up -d --no-deps heardit

# Plannit only
docker compose pull plannit
docker compose up -d --no-deps plannit

# MusiQL API and frontend together
docker compose pull musiql-api musiql-web
docker compose up -d --no-deps musiql-api musiql-web
```

Run only the relevant pair. These do not deploy infrastructure changes or restart
dependencies. Caddy reload is needed if its configuration changes. MusiQL's ETL
service uses the `tools` profile and is not part of a normal app startup; refresh
its image explicitly before an intentional catalog load:

```sh
docker compose --profile tools pull musiql-etl
docker compose run --rm musiql-etl load --sample
```

Catalog loading changes data; it is not a routine step for a UI/code update.

### 4. Verify the release

On EC2:

```sh
cd ~/trevorhuval-infra
docker compose ps
docker compose logs --tail=80 site
# Substitute heardit, plannit, musiql-api, or musiql-web as needed.
```

From Windows PowerShell:

```powershell
curl.exe -f https://trevorhuval.com/ -o NUL
curl.exe -f https://trevorhuval.com/heardit/healthz
curl.exe -f https://trevorhuval.com/plannit/healthz
curl.exe -f https://trevorhuval.com/musiql/api/health
```

Also open the changed page and test its behavior. A running container or a 200
response alone does not establish that the intended version is live. MusiQL's
health response includes database/catalog information; inspect its body too.

To verify an exact image version, use the published commit tag from the successful
workflow. The site and MusiQL publish full Git commit SHA tags; Heardit and Plannit
use Docker metadata's `sha-...` tag. Copy the actual tag instead of guessing it.
For example, on EC2 for the site:

```sh
# Replace FULL_COMMIT_SHA with the complete SHA from the successful run.
docker pull ghcr.io/trevorhuval/personal-site:FULL_COMMIT_SHA
docker image inspect ghcr.io/trevorhuval/personal-site:FULL_COMMIT_SHA --format '{{.Id}}'
docker inspect "$(docker compose ps -q site)" --format '{{.Image}}'
```

The two image IDs should match. Pulling an image alone does not deploy it.
If the correct image is running but the browser looks stale, hard-refresh with
Ctrl+Shift+R. The site's HTML revalidates; hashed assets are cached for a year.

## Studio: the owner-only content editor

`trevorhuval.com/studio` edits photos, captions and the site's copy without a
commit or deploy. It is a fifth service, `site-cms` (`src/cms`, image
`ghcr.io/trevorhuval/personal-site-cms`, published by the `cms-image` job in the
same workflow). Nothing links to it; five quick taps on the footer's © line open
it. Its design and security model are in [`src/cms/README.md`](src/cms/README.md).

The site does not depend on it: `/api/cms/content` failing just means visitors
get the content bundled into the site image.

### One-time setup (in `trevorhuval-infra`, which this repo cannot change)

1. Generate the secrets on your own machine. The password is prompted for and
   never printed:

   ```sh
   cd src/cms && npm install && npm run hash-password -- --secret
   ```

2. Add the two printed values to `~/trevorhuval-infra/.env` on EC2 under the
   names `STUDIO_PASSWORD_HASH` and `STUDIO_SESSION_SECRET`, single-quoted as
   printed.

3. `docker-compose.yml`: add the service and volume.

   ```yaml
     site-cms:
       logging: *default-logging
       image: ghcr.io/trevorhuval/personal-site-cms:latest
       restart: unless-stopped
       mem_limit: 768m   # a 48 MP photo decodes to ~150 MB; uploads run one at a time
       environment:
         PUBLIC_ORIGIN: https://${SITE_DOMAIN:-trevorhuval.com}
         # Blank leaves the studio disabled (its endpoints answer 404).
         ADMIN_PASSWORD_HASH: ${STUDIO_PASSWORD_HASH:-}
         SESSION_SECRET: ${STUDIO_SESSION_SECRET:-}
       volumes:
         - site-data:/data

   volumes:
     site-data:
   ```

4. `Caddyfile`: route the API and uploaded photos, above the final `handle`:

   ```text
   	handle /api/cms/* {
   		reverse_proxy site-cms:8080
   	}
   	handle /media/* {
   		reverse_proxy site-cms:8080
   	}
   ```

5. Deploy as usual (`./scripts/deploy.sh`, or `docker compose pull site-cms` and
   `docker compose up -d --no-deps site-cms`, then `docker compose exec caddy
   caddy reload --config /etc/caddy/Caddyfile`). The **site** image also changed
   (the `/studio` route and content loader), so pull `site` as well.

6. Verify: `curl -f https://trevorhuval.com/api/cms/health`, then open
   `/studio` and sign in.

### Operating it

- **Edits are data, not code.** They live in the `site-data` volume, so they
  survive image updates and are not in Git. Include `site-data` in
  `scripts/backup.sh`; `docker compose down -v` deletes it.
- **Reset to shipped version** in each tab drops that collection's edits and the
  site returns to the JSON in the repo. While a collection is edited,
  changing its JSON in the repo has no visible effect until it is reset.
- **Change the password**: rerun `npm run hash-password`, update
  `STUDIO_PASSWORD_HASH`, recreate `site-cms`. Every session is signed out.
- **Rate limiting** is in memory; restarting `site-cms` clears lockouts. Signed-out sessions stay signed out across restarts. Sign out when you finish: the cookie is scoped to `/api/cms`, but scripts in the other apps on this domain could still use it (see `src/cms/README.md`, "Known limitation").

## Persistent data, backups, and rollback

Compose named volumes retain Plannit's SQLite database, both PostgreSQL
databases, Heardit's data-protection keys, Caddy certificate data, and the MusiQL
dump cache across normal container recreation. Do not use `docker compose down
-v` for an update: it removes named volumes.

Before a release that changes database schema, run on EC2:

```sh
cd ~/trevorhuval-infra
./scripts/backup.sh
```

This creates timestamped MusiQL and Heardit dumps plus a live SQLite backup for
Plannit under `backups/`. Copy backups off-host separately. The script does not
schedule itself, enforce retention, verify restoration, or back up the server
`.env`, Caddy certificates, or Heardit's key ring.

To roll back code, replace the affected `:latest` image reference in the
infrastructure Compose file with a known-good published commit tag, sync/deploy,
and verify. Keep MusiQL API/web versions aligned. Database migrations are not
automatically reversed by an image rollback; check schema compatibility and
restore data only through a deliberate recovery procedure. Restore `:latest`
when ready to resume normal updates.

## First-time setup versus ordinary updates

`bash scripts/sync-to-server.sh --bootstrap` copies infrastructure and installs
Docker/Compose, enables Docker, adds swap if absent, and initializes `.env` if
needed. In bootstrap mode it **does not run the normal deploy**.

Initial setup still requires DNS pointing to the host, inbound TCP 80/443,
SSH access, a stable public address, server environment values and app credentials,
and a new login for Docker group membership. Then run `deploy.sh` and explicitly
load the desired MusiQL catalog. Credentials stay in gitignored configuration;
do not copy them into this document.

## Observations from the September 18 inspection

- All eight expected long-running containers were running; both Postgres
  containers reported healthy. No updater container was present.
- The personal site returned HTTP 200. Heardit and Plannit's public `/healthz`
  endpoints returned HTTP 200.
- Plannit's container nevertheless reported **unhealthy**. Its internal probe
  requests `/healthz` with `Host: localhost`; the production configuration uses
  a path base and restricted allowed hosts. Check that mismatch before treating
  the Docker status as proof of a database failure. The cause was not confirmed.
- MusiQL's public `/musiql/api/health` returned **502 from nginx**. Its frontend
  proxies `/api/` to `api:8080`. Inspect frontend/API logs and connectivity; an
  accessible frontend does not prove the API works. No repair or redeploy was
  performed during this documentation task.

## Configuration sources

- Site: `.github/workflows/image.yml`, `src/web/Dockerfile`, `src/web/nginx.conf`.
- Heardit, Plannit, MusiQL: each repo's `.github/workflows/` and startup code.
- Infrastructure: `docker-compose.yml`, `Caddyfile`, `scripts/deploy.sh`,
  `scripts/sync-to-server.sh`, `scripts/bootstrap-ec2.sh`, `scripts/backup.sh`.

This guide describes the inspected setup, not an automatic deployment service.
The missing automation step is a successful release triggering a controlled EC2
deployment, followed by production health checks. That is not configured here.
