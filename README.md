# Prerender PM2 FSCache Server

This runs [prerender](https://github.com/prerender/prerender/) under PM2, and efficiently caches the results to the
filesystem using [prerender-plugin-fscache](https://github.com/PythonicCafe/prerender-plugin-fscache).

```
bikeshopi-prerender-staging  | 2025-02-21T23:20:11.550Z [fscache] Caching https://b.org/b/x9StaGQ3 to /tmp/prerender-cache/c3/c367c69bb9b5b77b4718f528902984ae23071866
bikeshopi-prerender-staging  | 2025-02-21T23:20:19.850Z [fscache] Serving https://b.org/b/x9StaGQ3 from /tmp/prerender-cache/c3/c367c69bb9b5b77b4718f528902984ae23071866
```

[ecosystem.config.js](ecosystem.config.js) and [server.js](server.js) are both mounted from your local filesystem so you
can adjust as required and restart using Docker Compose.

## How bots reach this server (nginx integration)

This container is UA-agnostic: it renders whatever URL it is given as `GET /<url>` (or `GET /render?url=<url>`). Bot
detection happens in **nginx on the proxy host**, in two files that live *outside* this repo
(`/etc/nginx/conf.d/prerender.conf` and a per-host `*_location_override` snippet).

Flow, for a crawler hitting `https://shop.positivespin.org/b/Bj2-qRgI`:

1. `map $http_user_agent $prerender_ua` flags known bots (`googlebot`, `facebookexternalhit`, `twitterbot`,
   `slackbot`, `discordbot`, `whatsapp`, `telegrambot`, ...). If you emulate
   `facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)` in DevTools, you take the exact same
   path as Facebook's scraper.
2. Three override maps run downstream: `_escaped_fragment_` in the query string forces `1`; a request carrying
   `X-Prerender: 1` forces `0` (**loop guard #1**); static asset extensions (`.js`, `.css`, `.png`, ...) force `0`.
3. In `location /`, `if ($prerender = 1) { rewrite (.*) /prerenderio last; }` jumps to the prerender location:

   ```nginx
   location /prerenderio {
       if ($prerender = 0) { return 404; }
       proxy_set_header X-Prerender-Int-Type Nginx_Rev_Proxy;
       proxy_hide_header Cache-Control;
       add_header Cache-Control "private,max-age=600,must-revalidate";
       resolver 8.8.8.8 8.8.4.4;
       set $prerender_host "prerender.bikeshopi.org";
       proxy_pass http://$prerender_host;
       rewrite .* /$scheme://$host$request_uri? break;
   }
   ```

   The rewrite turns the path into `/https://shop.positivespin.org/b/Bj2-qRgI`, which is exactly the format this
   server's `util.getOptions()` expects (strip the leading `/`, decode, render).
4. The rendered HTML travels back through the same location to the crawler. Human (`$prerender = 0`) traffic goes
   straight to the app backend in `location /`.

The detection half, in `prerender.conf`:

```nginx
map $http_user_agent $prerender_ua {
    default        0;
    "~*Prerender"  0;
    "~*googlebot"  1;
    "~*facebookexternalhit" 1;
    "~*twitterbot" 1;
    # ... see the full list on the proxy host
}
map $args          $prerender_args { default $prerender_ua; "~(^|&)_escaped_fragment_=" 1; }
map $http_x_prerender $x_prerender  { default $prerender_args; "1" 0; }
map $uri           $prerender       { default $x_prerender; "~*\\.(js|css|png|jpg|...|woff2|svg|eot)$" 0; }
```

**Loop guards — do not break these.** When this server renders a page, its Chrome fetches the URL with the user agent
`"<original UA> Prerender (+https://github.com/prerender/prerender)"` and sends the header `X-Prerender: 1` (from the
`sendPrerenderHeader` plugin in [server.js](server.js)). That request passes back through nginx, where both the
`"~*Prerender" 0` UA rule and the `$http_x_prerender` map force `$prerender = 0`, so it reaches the app instead of
looping. **Never override `userAgent` in `server.js`, and never pass `userAgent=` to `/render`** — dropping the
"Prerender" token creates an infinite render loop.

**Caveat:** the human path (`location /`) sets `add_header Cache-Control "public,max-age=31536000"` on *all* responses,
including HTML. Facebook is unaffected (it scrapes through `/prerenderio`, which sends
`private,max-age=600`), but your own curl/browser tests can show year-old cached HTML. Use
`curl -H 'Cache-Control: no-cache'` (or a private window) when verifying.

## Reliability design (why these settings)

Fixed in Oct 2026 after scrapers (facebookexternalhit et al.) intermittently got empty pages or 504s while manual tests
passed. Three root causes, all visible in the logs/cache of the old config:

1. **`instances: 1` in [ecosystem.config.js](ecosystem.config.js).** The old `PHANTOM_WORKERS=3` cluster spawned three
   Node workers, each spawning its own Chrome hard-bound to debugging port `9222` ([server.js](server.js)). Only one
   Chrome could bind the port; all three workers connected to *that* Chrome. Whenever it restarted, all three workers
   lost their websocket simultaneously → real requests failed with
   `Cannot connect to browser port=9222 ... Unexpected server response: 404` and **`got 504 in ~3500ms`**
   (~200 occurrences per worker in the logs). One instance still handles many concurrent renders (one Chrome tab per
   request).
2. **`TIMEOUT_STATUS_CODE=504`.** prerender resolves a *timed out* render with whatever is in the DOM at that instant
   (log signature: `page timed out url=... requestsInFlight=0`). Without this setting the response kept status `200`,
   and since `200` is cacheable, splash screens and `<div id="q-app"><!----></div>` empty shells were frozen in the
   cache for 24h — served to every crawler in between. With `504` (not in `CACHE_STATUS_CODES`) partial renders are
   never cached.
3. **`PAGE_LOAD_TIMEOUT=15000`** (was 3000). The Quasar SPA needs >3s to boot, fetch route data and inject
   `og:` tags on a cold cache; 3s guaranteed frequent partial snapshots. The cache TTL was also cut from 86400s to
   **3600s** so any bad entry self-heals within an hour, and `404` was dropped from `CACHE_STATUS_CODES` so transient
   404s are no longer frozen for a day.

Remaining recommendation (app repo, not here): set `window.prerenderReady = false` inline in `index.html` and flip it
to `true` only after route data is fetched and `og:` tags are injected. prerender explicitly waits for that boolean,
which removes the last "network-quiet heuristic" race.

## Environmental Variables for `docker-compose.yml`
```
IMAGE=prerender
CONTAINER_NAME=prerender
VIRTUAL_HOST=b.org
LETSENCRYPT_HOST=b.org  # Uses nginxproxy/acme-companion
CACHE_VOLUME=prerender-cache  # docker volume create prerender-cache

# optional env variables
LETSENCRYPT_TEST=false
PAGE_LOAD_TIMEOUT=15000   # default 15000; raise only if the app grows slower
TIMEOUT_STATUS_CODE=504   # timed-out partial renders return 504 and are NOT cached
CACHE_STATUS_CODES=200,301,302
CACHE_TTL=3600            # 1h: bad entries expire quickly
PHANTOM_WORKERS=3         # legacy, ignored: instances is fixed to 1
```

## Deploying changes & purging the cache

Env changes require a **recreate** (restart keeps the old environment):

```bash
docker compose up -d --force-recreate prerender
```

To drop every cached snapshot (do this after fixing bad renders or changing the app's head/meta tags):

```bash
docker compose exec prerender sh -c 'rm -rf /home/node/prerender-cache/*'
```

Note: scrapers cache on their side too. After purging, force a fresh Facebook scrape in the
[Sharing Debugger](https://developers.facebook.com/tools/debug/) ("Scrape Again"); Twitter/Slack/WhatsApp have
similar debug tools.

## Verification checklist

```bash
# 1. Emulate Facebook's crawler (first, uncached render can take up to ~16s; repeat = instant from cache):
curl -s -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' \
     https://shop.positivespin.org/b/Bj2-qRgI -o /tmp/render.html -w '%{http_code} in %{time_total}s\n'

# 2. Confirm the render is complete: og: tags present, app actually rendered
grep -o 'og:title[^>]*'   /tmp/render.html
grep -o '<div id="q-app">.\{0,80\}' /tmp/render.html   # must NOT be <!----> or the blue q-loading splash

# 3. Watch a live render while repeating step 1
docker compose logs -f prerender | grep -E 'page timed out|got [0-9]+ in|Cannot connect'
```

Healthy log output: `got 200 in ...ms` with **no** `page timed out` on the same URL and no
`Cannot connect to browser port`. A `page timed out` here means the app was too slow again — the 504 will be returned
and (by design) not cached.

## Prerender Cache Volume
The cache is mounted on an external named volume for persistence.

## PM2 Monit
To monitor PM2 processes, run:
```
docker compose exec prerender pm2 monit
```

## Session history
Diagnosis and fix for "prerender returns empty/504 for facebookexternalhit" were done in OpenCode session
`ses_e9e4f0de0ffek5qQwiBDdgwZ3S` (Oct 2026). Restore with `opencode session import <export.json>` or
`opencode --continue` if the local session DB survived.
