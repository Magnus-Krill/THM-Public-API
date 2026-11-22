# THM Public API

The API serves public 6b6t highway data, kit prices, cape selections and signed
THM Addons updates. Requests do not need a token.

**Base URL** `https://api.highwaymen.cc`

| GET path | Response | Cache lifetime |
| --- | --- | --- |
| `/highway-lengths` | Mapped and paved lengths by dimension and route | 60 seconds |
| `/status` | Active workers on main highways | 15 seconds |
| `/status?routes=1` | Active workers, including off-main routes | 15 seconds |
| `/users` | Minecraft usernames, rank and branch | 60 seconds |
| `/kits` | Publicly orderable kit names and token prices | 5 minutes |
| `/cape` | Selected cape IDs by Minecraft username | 60 seconds |
| `/updates` | Browser downloads for the latest stable and development builds | 60 seconds |
| `/updates/feed.json` | Signed THM Addons update manifest | 60 seconds |
| `/updates/{branch}/dev/{commit}.jar` | Developer build for a full Git commit SHA | 1 year, immutable |
| `/updates/{branch}/stable/{tag}.jar` | Stable build for a release tag | 1 year, immutable |

Responses support `HEAD`, `Cache-Control` and `ETag`. Send the returned ETag
in an `If-None-Match` header to receive a bodyless `304` when the response
matches. The API caches serialized JSON for up to five seconds at the origin.
Keep `routes=1` in cache keys. Unavailable data returns `503` and missing update
files return `404`. Those errors are not cacheable. The live service limits
requests to 100 per IP per five minutes.

```sh
curl -i https://api.highwaymen.cc/highway-lengths
curl -i 'https://api.highwaymen.cc/status?routes=1'
```

## Highway lengths

```json
{
  "nether": {
    "N": { "paved": 12000000, "total": 29999981 },
    "ring-25000": { "paved": 200000, "total": 200000 }
  },
  "overworld": {},
  "end": {}
}
```

Main routes use compass codes and measure from spawn. Rings and diamonds use
`ring-<radius>` or `diamond-<radius>` and sum mapped sections around the loop.
Lengths are horizontal distances rounded to whole blocks. `total` includes
paved and dug sections, counting overlaps once. Roads without mapped progress
are omitted.

## Worker status

```json
{
  "DugN": {
    "direction": "N",
    "mode": "dug",
    "workers": [
      { "username": "ExamplePlayer", "timestamp": 1760000001000, "since": 1760000000000 }
    ],
    "username": "ExamplePlayer",
    "timestamp": 1760000001000,
    "since": 1760000000000
  }
}
```

Time values use Unix milliseconds. Workers expire after ten minutes without a
heartbeat. Each road lists up to eight workers, newest first. The fields
outside `workers` mirror the newest worker for older clients. Off-main
buckets have an `Off` prefix and their workers can include `route` and
`routeLabel`.

## Users, kits and capes

- `/users` returns a JSON array such as
  `[{"usernames":["ExamplePlayer"],"rank":"Highway Man","branch":"Main"}]`.
  Each row describes one Minecraft account.
- `/kits` returns `{"success":true,"kits":[{"name":"pvp","price":0.5}]}`.
  Prices are in tokens. Kit availability and balance are checked when ordering.
- `/cape` returns
  `{"players":{"ExamplePlayer":{"username":"ExamplePlayer","cape":"thm1"}}}`.
  Cape IDs resolve through the [cape index](https://highwaymen.cc/cape/index).

## Signed updates

Download releases in your browser at [THM Addons downloads](https://api.highwaymen.cc/updates/).
The page verifies the feed signature and links to the latest build for each Minecraft
version and channel. JAR responses are attachments.

The feed contains a base64-encoded `payload` and an Ed25519 `signature`.
Verify the signature before reading the manifest entries. Use each entry's
published download URL and verify its SHA-256, branch and Minecraft version
before installing it. See [THM Updater](https://github.com/Magnus-Krill/THM-Updater)
for the publisher.

## Run and integrate

Use Node 22 or later. Install with `npm ci` and run `npm test`.

Run just the downloads, feed and JAR endpoints without KitBot:

```sh
UPDATES_DIR=/path/to/publisher/files npm start
```

The download service defaults to `127.0.0.1:4311`. Set `HOST` and `PORT` for
your tunnel's origin, and set `UPDATES_PUBLIC_KEY` to your Base64 DER public key
if you sign with a key other than THM's. For an independent Cloudflare Tunnel
origin, route both `/updates` and its subpaths to this service and preserve their
paths. Keep the existing public feed and JAR URLs for installed addon clients.

The production API mounts the Express router before its authenticated write
routes. Pass a directory containing published updater files and functions that
read Kitbot's existing data. The router returns only the documented fields.
Keep production data and signing keys outside the checkout.

```js
import { createPublicApi } from './thm-public-api/index.mjs';

app.use(createPublicApi({
    readers: {
        users: readUserRanks,
        activity: readHighwayActivity,
        routeLabel: highwayRouteLabel,
        kits: readKitConfig,
        lengths: readMappedHighwayLengths,
        capes: readCapeDb
    },
    updatesDir: '/path/to/published-updates'
}));
```
