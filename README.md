# Prerender PM2 FSCache Server

This runs [prerender](https://github.com/prerender/prerender/) as a PM2 cluster, and efficiently caches the results to the filesystem using [prerender-plugin-fscache](https://github.com/PythonicCafe/prerender-plugin-fscache).


```
bikeshopi-prerender-staging  | 2025-02-21T23:20:11.550Z [fscache] Caching https://b.org/b/x9StaGQ3 to /tmp/prerender-cache/c3/c367c69bb9b5b77b4718f528902984ae23071866
8f528902984ae23071866
bikeshopi-prerender-staging  | 2025-02-21T23:20:19.850Z [fscache] Serving https://b.org/b/x9StaGQ3 from /tmp/prerender-cache/c3/c367c69bb9b5b77b4718f528902984ae23071866
```
[ecosystem.config.js](ecosystem.config.js) and [server.js](server.js) are both are mounted from your local filesystem so you can adjust as required     and restart using Docker Compose.

## Environmental Variables for `docker-compose.yml`
```
IMAGE=prerender
CONTAINER_NAME=prerender
VIRTUAL_HOST=b.org
LETSENCRYPT_HOST=b.org  # Uses nginxproxy/acme-companion
PHANTOM_WORKERS=3
CACHE_VOLUME=prerender-cache  # docker volume create prerender-cache

# optional env variables
LETSENCRYPT_TEST=false
PHANTOM_WORKERS=4
CACHE_STATUS_CODES=200,301,302,303,304,307,308,404
CACHE_TTL=86400 
```

## Prender Cache Volume
The cache is mounted on an external named volume for persistance.

## PM2 Monit
To monitor PM2 processes, run:
```
docker compose exec prerender pm2 monit
```