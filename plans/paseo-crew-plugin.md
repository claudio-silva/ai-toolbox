# Crew in Paseo: a viability study and plan for a Paseo plugin

Status: proposal, 2026-10-21.
Paseo version checked: 0.12.0, commit `068f272` (2026-10-20). "Paseo repo" below means `github.com/getpaseo/paseo` at that commit.
Crew version: `f5ea62e`. Its dashboard already listens on every interface, takes a key from other devices, shows a QR code, and treats proxied requests as remote.

## 1. Goals

- **A. Desktop side panel.** On the desktop, every workspace whose project has a `.crew/` folder shows the dashboard in a side panel, without being asked.
- **B. Remote access.** The dashboard can be reached from the Paseo mobile app and from other machines. This covers two cases:
  - the laptop running the crew, opened from elsewhere;
  - a Paseo daemon on a remote server.
- **C. Fallbacks.** If plugins cannot reach the mobile app, use the phone's browser. As a last resort, build a mobile app just for the dashboard.

## 2. Verdict

| Goal | Viable? | How |
| --- | --- | --- |
| A. Auto side panel (desktop) | **Partly** | No plugin API opens a panel on its own without stealing focus, and there is no "workspace opened" event. The lead can open the dashboard in a background browser tab at session start, today, without a plugin. A plugin can add a one-click header button; a panel tab, once open, is restored. |
| B. Mobile app | **Yes, but not the web page** | Plugin client code runs on iOS and Android, but cannot embed a web page: plugins get no WebView. A native "Crew" panel, fed by plugin RPC, works on every platform and through the relay, with nothing exposed to the network. The full web dashboard on a phone still needs the phone's browser and a route to it. |
| B. Remote daemon | **Yes** | The native panel works unchanged through the relay. The full dashboard needs one of these routes: Tailscale (best), an SSH tunnel (desktop), or a tunnel with identity checks (ngrok OAuth, Cloudflare Access). |
| B. Through Paseo's service proxy (`paseo.json`) | **Possible, but weak** | Services don't start on their own. Their links carry no key. Reaching them from a phone needs `serviceProxy.listen`, a `publicBaseUrl` and wildcard DNS. Paseo's password does not protect proxied services. |
| C. Dedicated mobile app | **Not needed** | The plugin panel plus the phone's browser cover it. Over HTTPS (Tailscale or a tunnel), the browser can install the dashboard as a web app. A native app would still need a route to the dashboard, because only plugins can use Paseo's relay. |

**Recommendation:** in three steps:
1. Phase 0 is small changes in crew.
2. Phase 1 is a plugin with a native panel, which reaches the mobile app and a remote daemon at no risk.
3. Phase 2 is an optional tunnel manager, for the full dashboard anywhere.

## 3. What Paseo offers

### Plugins

These facts are confirmed. Paths are in the Paseo repo.

- **What a plugin is.** A TypeScript folder with a `paseo-plugin.json` manifest (`id`, `name`, `icon`, `description`, `requirements.paseo`, `build`). It has `index.client.tsx` and/or `index.server.ts`. Paseo compiles it (`public-docs/plugins/reference.md:29-130`).
- **Distribution.** Through the reviewed registry (`paseo plugin add owner/slug`), from Git or npm, or from a local folder (`paseo plugin install /abs/path`) (`docs/plugins.md:9-163`).
- **Maturity.** The API is public and documented, but before 1.0. Version 0.8 broke it, with a migration guide. Plugins are off until the user turns on `pluginsEnabled`. They are trusted code and are not sandboxed (`docs/plugins.md:39`).
- **Where the code runs.**
  - Server code runs as a subprocess on the daemon's host, with full Node: it can read files and run processes.
  - Client code runs in every app: Electron, web, iOS and Android (`public-docs/plugins/index.md:22`).
- **Client modules.** Only `react`, `react-native`, `zod`, `@tanstack/react-query` and Paseo's SDK; anything else throws. In particular, plugins get no `react-native-webview` (`packages/app/src/plugins/evaluate.ts:434-458`, checked).
- **What the client can add.** Screens, sidebar items, workspace panels (shown as workspace tabs), command-center items, slash commands, a header button per workspace (`addHeaderButton({ id, workspaceId, button })`), composer pills, themes and settings screens. It can also call `openPanel(id, { workspaceId })` (`packages/plugin/src/client/contracts.ts:136-157`, `buttons.ts:49`, checked).
- **What the server can do.** Typed RPC handlers that the client calls (`handle`), event hooks (`on` and `before`), providers, usage sources and settings (`packages/plugin/src/server/contracts.ts:30-43`). RPC is request and response only, and it goes through the relay (`packages/plugin/src/rpc.ts`).
- **Events.** Server side only: `workspace.created`, `workspace.archived` and agent events. There is no "workspace opened" event (`public-docs/plugins/reference.md:727-739`, checked).
- **Missing APIs.** There is no way to register a service or a proxy route, no secret store (settings are JSON on the host), and no client API that lists workspaces with their folders (to be confirmed in the spike).

### The in-app browser and panels

- **The browser is desktop only.** Other builds show "Browser is desktop-only" (`packages/app/src/desktop/browser/pane/index.tsx`; `public-docs/browser.md:45-47`). A tab loads on the desktop's network, even for a workspace whose daemon is remote.
- **How tabs open:**
  - an agent calls `browser_new_tab`, which opens the tab in the background without switching views;
  - the user opens one;
  - on the desktop, a service link can open in the app;
  - a plugin calls `navigation.openBrowser({ url, workspaceId })`. This is Electron only, and only from panel and screen props (`packages/plugin/src/client/contracts.ts:36-48`).
- **No automatic opening.** Nothing opens a panel when a workspace opens. `openPanel` navigates to the workspace, so calling it unprompted would steal focus (`packages/app/src/plugins/navigation.ts:31-38`).

### `paseo.json` services and the service proxy

- **Schema.** A script has `type`, `command` and `port`. Services get `PASEO_PORT`, `PASEO_URL`, `HOST` and related variables. There is no autostart, no health-check setting and no custom environment (`packages/protocol/src/paseo-config-schema.ts:38-80`).
- **Attaching to crew's server works.** An explicit `port` is used as is, and the route lives as long as the script's terminal. A filler command (`tail -f /dev/null`) is therefore enough to point a service at crew's running dashboard.
- **Links.** A service gets up to three:
  - a public one, when `publicBaseUrl` is set;
  - a `*.localhost` one, which works only on the daemon's machine;
  - a "direct" `http://<daemon-ip>:<port>`, when the app connects to the daemon directly.

  The phone opens them in the system browser (`packages/app/src/utils/workspace-script-links.ts:39-91`).
- **The proxy.** It streams responses, so server-sent events should pass (inferred), and supports WebSockets. It keeps Host as `<script>--<branch>--<project>.localhost:<port>` and sets `X-Forwarded-*`. Crew therefore asks for its key, which is the safe outcome.
- **Reaching it from a phone.** That needs `daemon.serviceProxy.listen` plus `publicBaseUrl` with wildcard DNS. Paseo's docs say: "Daemon password authentication protects daemon APIs; it does not protect proxied dev services" (`docs/service-proxy.md:80`).

### The relay

The relay is an end-to-end encrypted WebSocket for Paseo's own protocol (`packages/relay/src/cloudflare-adapter.ts`). It carries no HTTP or TCP forwarding; plugin RPC is what it does carry.

Related work upstream:

| Item | Topic | Status |
| --- | --- | --- |
| #6396 | built-in port forwarding to desktop and phone | idea |
| PR #6534 | desktop browser tabs use the host's network, through the relay | open; would fix desktop plus remote daemon |
| #5834 | WebView in plugin panels | idea |
| #7190 | in-app browser on mobile | idea |
| #5852 | per-service public URL | idea |
| #4343 | community plugin `lyhu/paseo-plugin-tunnel`, HTTP and SSE between two daemons over the relay | exists |

### Detecting Paseo

- **Agents** get `PASEO_AGENT_ID` and `PASEO_AGENT_CWD`. Desktop installs also expose `PASEO_CLI` (seen in this session).
- **Terminals and scripts** get `PASEO_WORKSPACE_ID` and the `paseo` CLI on PATH.
- **The CLI** has `paseo script ls|start|stop` and `paseo workspace ls --json`, but no command that opens a browser tab. Only agents can, through MCP.

### The mobile app

It is built with Expo and React Native. Plugin screens, panels and header buttons render there, with native components only. It shows service links and opens them in the system browser.

## 4. Routes to the full dashboard

Sources were checked on 2026-10-21. No tunnel was opened to test them.

| Route | Account | HTTPS | Stable URL | Server-sent events | Identity check (free) | Limits and conditions |
| --- | --- | --- | --- | --- | --- | --- |
| LAN (done) | none | no | changes with the network | yes | crew key | same Wi-Fi only |
| SSH tunnel `-L` | none | no | yes | yes | SSH | desktop only |
| Tailscale Serve | Tailscale, also on the phone | yes (MagicDNS certificates) | yes | likely (Go's reverse proxy flushes event streams) | tailnet identity, never public | Personal plan is non-commercial |
| Tailscale Funnel | Tailscale | yes | yes | likely | none: public | beta; ports 443/8443/10000 only |
| ngrok free (`@ngrok/ngrok`, no binary) | yes (authtoken) | yes | one dev domain | likely | OAuth policy limited to your email | 1 GB and 20k requests a month; a warning page before HTML |
| Cloudflare named tunnel + Access | yes, plus a domain on Cloudflare | yes | yes | likely (timeout 125 s; the dashboard's heartbeat is every 30 s) | Access: email code, GitHub, Google (free up to 50 users) | needs the domain |
| Cloudflare quick tunnel | none | yes | new URL each run | **no**: "Quick Tunnels do not support Server-Sent Events" | `--allowed-mail` | "testing and development" only; 200 requests in flight |
| Microsoft Dev Tunnels | GitHub or Microsoft | yes | yes | risky (streams hang, then 504) | private by default | rewrites Host to `localhost` (now harmless: crew sees the forwarding headers) |

Sources:
- Cloudflare: [quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), [connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)
- ngrok: [free plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits/)
- Tailscale: [Serve](https://tailscale.com/kb/1312/serve), [Funnel](https://tailscale.com/kb/1223/funnel)
- Microsoft: [Dev Tunnels security](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/security)

Recommended routes:

- **Most secure:** Tailscale Serve. It is never public, and it decrypts on your own machine rather than at a provider.
- **Public with an identity check:** ngrok with an OAuth policy, or Cloudflare Access when you have a domain on Cloudflare.
- **Quick tunnels:** only once the page can fall back to polling.

## 5. Design

### Phase 0: in crew, no plugin (small)

1. **The lead opens the dashboard in Paseo.** When `PASEO_AGENT_ID` is set and Paseo's browser tools are available, the lead opens the dashboard after `crew session start`:
   - It lists the tabs; if none shows the dashboard, it opens one in the background with `browser_new_tab`. This is desktop only.
   - It uses `http://127.0.0.1:<port>/` when the daemon is on this computer. For a remote daemon it uses the network URL, until PR #6534 lands.
   - It costs one line in SKILL.md, within the 5,000-token limit.
2. **Polling fallback.** When the event stream keeps failing (proxies that buffer, quick tunnels), the page polls `api/state` every 10 s instead.
3. **Document Tailscale Serve.** `tailscale serve --bg --https=<port> http://127.0.0.1:<port>`, opened as `https://<machine>.<tailnet>.ts.net:<port>/?key=…`. Tailscale adds the forwarding headers, so crew asks for its key.
4. **Already done:** the LAN listener, the key, the QR code, and proxied requests treated as remote (commits `fd14a23`, `4b3ea3a` and `f5ea62e`).

### Phase 1: a plugin with a "Crew" panel everywhere (medium)

Start with a spike of about half a day, to confirm five things:
- how client code learns which workspaces exist and their folders: from a server-side map fed by `workspace.created`, or something else;
- `addHeaderButton` per workspace on all four platforms;
- the RPC payload limit through the relay (crew's state is about 30 KB);
- `react-query` polling on iOS;
- `openBrowser` from a panel.

**Server side (`index.server.ts`).** Three RPC calls:

| Call | Returns | How |
| --- | --- | --- |
| `crew.probe({ workspaceId })` | `{ crew, running, port }` | Resolves the workspace's main checkout as crew's server does (git common dir), checks `.crew/`, reads `.crew/tmp/dashboard.json` and pings it. |
| `crew.state({ workspaceId })` | crew's model as JSON | Fetches `http://127.0.0.1:<port>/api/state` by a local name, so no key is needed. Starts the dashboard first if it isn't running (`node .crew/dashboard/server.mjs start --root <dir>`). Falls back to `node server.mjs state` if it can't run. |
| `crew.share({ workspaceId })` | the URL for other devices, with the key | Reads crew's `api/share`; in Phase 2, the tunnel's URL. |

**Client side (`index.client.tsx`):**
- **Header button.** A "Crew" button on crew workspaces, with a dot when a question is waiting for you.
- **Native panel.** Built from React Native components, so it runs unchanged on desktop, web and mobile. It shows:
  - the lead's state and its live duration;
  - the set's progress and counts;
  - the task in progress;
  - running agents, with live durations;
  - questions waiting for you, with their text;
  - open defects;
  - the last journal lines.

  It refreshes every 5 s while visible and every 60 s otherwise.
- **"Open the full dashboard."**
  - On the desktop: `openBrowser` with the local URL (or the network URL for a remote daemon).
  - Elsewhere: `Linking.openURL` with the shared or tunnel URL.
- **"Show QR code."** Drawn with React Native views from `uqr`'s matrix, assuming the plugin build can bundle `uqr`; otherwise the server returns the matrix.
- **Out of scope.** Charts (the Gantt chart, the task graph) stay on the web page.
- **Version tolerance.** The model's shape varies with crew's version. The plugin parses it with `zod` and treats every field as optional.

### Phase 2: the full dashboard from anywhere, with a tunnel manager (medium to large)

- **Setting.** One plugin setting picks the route: off, Tailscale Serve, ngrok, a Cloudflare named tunnel with Access, or a quick tunnel (only with Phase 0's polling).
- **One tunnel per daemon host, routed by path.**
  - The plugin's server runs a small reverse proxy on `127.0.0.1` that maps `/<project>/…` to each project's dashboard, and the tunnel points at it.
  - The page uses relative URLs only (Vite `base: './'`, `api/…`, `files?p=…`; checked), so it works under a sub-path.
  - One free ngrok domain then covers every project.
- **Two locks.** The tunnel's identity check comes first: tailnet identity, ngrok OAuth limited to your email, or Cloudflare Access. Crew's key comes second: the plugin adds `?key=` to the links it opens, and the proxy's forwarding headers make crew require it.
- **Lifecycle.** The tunnel starts when a crew workspace exists and the setting is on, and stops when the last one is archived. The plugin checks it once a minute.
- **Tokens.**
  - Prefer the provider's own config: `~/.config/ngrok/ngrok.yml`, `cloudflared` credentials, `tailscale` login.
  - Otherwise use plugin settings, which are plain JSON on the host; the plugin says so.

### Phase 3: later

- **Ask upstream** for a client "workspace opened" event, or `openPanel({ focus: false })`, which would give real automatic opening; and for WebViews in plugin panels (#5834), which would let the full dashboard replace the native panel on mobile.
- **Notify on "waiting for you"**, if Paseo exposes notifications to plugins (not found in 0.12).
- **Make the dashboard installable** as a web app (manifest and service worker) when served over HTTPS.

## 6. Alternative considered: a `paseo.json` service

Crew could add a `crew` service to the project's `paseo.json`, with its port and a filler command, and start it with `paseo script start crew`.

- **For:** it needs no plugin, and the link shows on every platform, the phone included.
- **Against:**
  - It edits a file the project commits.
  - It has to be started explicitly.
  - Its links carry no key, so a first visit from another device hits crew's "needs the key" page.
  - The phone can reach it only through a direct connection (LAN or Tailscale) or `publicBaseUrl` with wildcard DNS, and Paseo does not protect it.

It is worth keeping as an opt-in (`crew paseo service`). It should not be the main route.

## 7. Security

- **Native panel.** The data travels inside Paseo's own channel (the end-to-end encrypted relay, or the daemon's authentication). Nothing new is exposed.
- **LAN.** Crew's key, sent once in the URL and then kept in a cookie for each port. Traffic is plain HTTP, so on an open network the key can be captured. You can replace it by deleting `.crew/tmp/dashboard.key`.
- **Tunnels.**
  - An identity check at the provider, plus crew's key.
  - Crew always asks proxied requests for the key (`f5ea62e`).
  - Never use Funnel, or a quick tunnel without `--allowed-mail`, for a project.
  - Cloudflare and ngrok decrypt traffic at their edge; Tailscale Serve does not.
- **Plugins.** They are trusted code without a sandbox. The API is before 1.0, so expect migrations.

## 8. Risks and unknowns

- Plugin API changes before 1.0, and plugins are off by default.
- The spike items in Phase 1.
- ngrok's free quota: 20k requests a month suits server-sent events, but not polling.
- Not verified on ngrok, Cloudflare named tunnels or Tailscale Funnel: whether server-sent events pass.
- Tailscale's Personal plan is for non-commercial use; check before using it for company work.
- A Cloudflare named tunnel needs a domain on Cloudflare.

## 9. Questions for you

1. **Tailscale.** Can you use it here (company use, given the Personal plan's terms), and is it on your phone? If so, Phase 2 can start with Tailscale only.
2. **Cloudflare.** Do you have a domain on Cloudflare, for Access?
3. **Where the plugin lives.** This repository (`plugins/paseo-crew/`), its own repository, or Paseo's registry?
4. **The background tab.** May the lead open the dashboard tab by itself at session start (Phase 0, item 1)?

## 10. Next steps

1. Phase 0, items 1 to 3 (crew).
2. The Phase 1 spike, then the plugin's panel.
3. Phase 2, starting with the route chosen in question 1.
