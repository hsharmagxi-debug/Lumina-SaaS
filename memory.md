# Lumina-SaaS — session memory (2026-09-05)

Detailed, dated log of everything done to this repo/app in this session. Kept inside the repo
so it travels with the code. See also `handoff.md` (next-step instructions) and the global
skill `lumina-saas` (`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-
equivalent digest loadable from any working directory.

**Never commit real secret values to this file or anywhere else in this repo.** All credentials
referenced below live only in `C:\Projects\Credentials\.env` (outside any git repo) under the
`LUMINA_*` variable names — this file names the variables, never the values.

## 0. Repo basics

- GitHub: `hsharmagxi-debug/Lumina-SaaS` (private). Local clone: `C:\Projects\Lumina-SaaS`.
- Stack: Vite + React + Express. `server.ts` is the dev entry (`npm run dev` → `tsx server.ts`,
  serves on `http://localhost:3000`). Single large `index.html` holds essentially the whole
  front-end (styles, markup, and a big inline `<script>` with all app logic).
- Firebase project backing auth: **`gen-lang-client-0531769124`** (display name in Firebase
  Console: "lumina-numerology"), authDomain `gen-lang-client-0531769124.firebaseapp.com`. This
  is an AI-Studio-generated app — same config values are baked into `firebase-applet-config.json`
  at repo root and into `index.html`'s inline `firebaseConfig` object.
- `npm install` and `npm run dev` both verified working cleanly (284 packages, 3 moderate
  non-blocking vulnerabilities).

## 1. Initial audit — found 8 of 9 login providers were fake

The sign-in modal ("SIGN IN / REGISTER") offers 9 providers: Google, LinkedIn, GitHub,
Instagram, Facebook, X/Twitter, Yahoo, Microsoft, Discord.

**Before this session's fixes**, only Google was real (genuine Firebase `signInWithPopup` +
`GoogleAuthProvider`). The other 8 were entirely client-side mocks:
- 7 of them (LinkedIn, Instagram, Facebook, X, Yahoo, Microsoft, Discord) shared one fake
  "Secure {Provider} Sign-In" template that logged in as a hardcoded persona **"Cosmic Seeker"**
  — and had a live bug where the pre-filled username field showed literal `user.[object
  Object]@lumina.net` instead of a real value.
- GitHub had its own fake "Authorize {username}" template, hardcoded to the developer's own
  GitHub username (`hsharmagxi-debug`) with a fake persona **"Dev Astrologer"**.
- All of them call the same `submitInlineAuth(name, email, avatar, provider)` helper that both
  the real and fake flows share — it sets `currentUser`, writes to `localStorage`, shows a
  toast, and closes the modal.

**Google's flow needed one fix to work locally**: `auth/unauthorized-domain` — `localhost`
wasn't in Firebase's Authorized domains, nor in the matching Google Cloud OAuth Client's
Authorized JavaScript origins. Fixed by adding `localhost` (Firebase Console → Authentication →
Settings → Authorized domains) and `http://localhost:3000` (Google Cloud Console → APIs &
Credentials → the OAuth 2.0 Client matching `firebase-applet-config.json`'s `oAuthClientId` →
Authorized JavaScript origins). Confirmed working end-to-end by the user afterward.

## 2. Scope decision for wiring up the rest

User chose **"Tier 1 only"**: providers Firebase supports natively (no custom backend needed) —
GitHub, Facebook, X/Twitter, Microsoft, Yahoo. In practice **Yahoo was never reached** (dropped
implicitly once the other four were done); LinkedIn, Instagram, and Discord remain intentionally
fake (Tier 2 — would need a custom backend + Firebase Admin SDK + service-account key, out of
scope for this session).

**Result: 4 of 5 Tier 1 providers wired to real OAuth and user-confirmed working. The 5th
(Microsoft) was wired and enabled but the live popup test was still pending user confirmation
when this file was written — check `handoff.md` for current status.**

## 3. GitHub — done, user-confirmed working

- Checked `hsharmagxi-debug`'s own Developer Settings first: no existing OAuth Apps/GitHub Apps.
- Found an existing app **"KPIHub Production"** under the `thekpihub` org, but it had 0 users
  and was for an unrelated project — **decided not to reuse it** (would show "Authorize KPIHub
  Production" on Lumina's own login screen, wrong branding, wrong repo).
- Created a **fresh dedicated OAuth App**: `Lumina Numerology (Dev)`, under the
  `hsharmagxi-debug` personal account.
  - Homepage URL: `http://localhost:3000`
  - Authorization callback URL: `https://gen-lang-client-0531769124.firebaseapp.com/__/auth/handler`
  - Credentials saved as `LUMINA_GITHUB_CLIENT_ID` / `LUMINA_GITHUB_CLIENT_SECRET` in
    `C:\Projects\Credentials\.env`.
  - **Gotcha hit and fixed**: initially misread the Client ID off a screenshot as containing
    `L01` (letter-L, zero, one) when it was actually `LO1` (letter-L, letter-O, digit-one) —
    classic l/I/1/O/0 screenshot-OCR ambiguity. This caused a real GitHub 404 on the OAuth
    authorize URL until corrected in both `.env` and Firebase. **Lesson: for any credential
    read off a web UI, prefer `read_page`/`find` (exact DOM/accessibility-tree text) over
    zooming into a screenshot — used exclusively for Facebook and Microsoft's secrets
    afterward, with no further misreads.**
- Enabled the **GitHub** provider in Firebase Authentication → Sign-in method, with that Client
  ID/Secret. Callback URL auto-matched.
- Code: `index.html`'s `triggerFederatedLogin('github')` branch rewritten to call real
  `new firebase.auth.GithubAuthProvider()` (scope `user:email`) via `auth.signInWithPopup(p)`,
  mirroring the existing Google branch's pattern (loading-state button swap, `.then`/`.catch`,
  `submitInlineAuth(...)` on success).
- **Detour that was reverted**: tried switching to `signInWithRedirect` purely so this session's
  own browser automation could drive the flow end-to-end (a popup opens a separate OS-level
  window the automation tool cannot see or control). The redirect *did* complete a real GitHub
  authorize round-trip, but `auth.getRedirectResult()` came back empty afterward — root cause is
  a genuine, documented Firebase limitation: redirect-based sign-in needs third-party storage
  access between the app's origin (`localhost:3000`) and the Firebase authDomain
  (`*.firebaseapp.com`), which modern Chrome's storage partitioning blocks by default, especially
  on `localhost`. This would likely affect real users testing locally too, not just automation.
  **Reverted GitHub back to `signInWithPopup`** (matching Google, the one provider proven to
  work end-to-end by an actual human) and added a `getRedirectResult()` handler near Firebase
  init anyway (harmless no-op for popup flows; kept in case a future provider ever uses redirect).
- **Two unrelated pre-existing bugs fixed along the way**:
  1. `closeAuthModal()` never reset which inner view (`auth-initial-view` vs
     `auth-provider-view`) was showing — reopening the modal after a real-auth attempt that
     didn't finish (error, or user navigating away) left it blank. Fixed by calling
     `goBackToAuthInitial()` from `closeAuthModal()`, and also from the Google/GitHub/etc.
     error-catch blocks.
  2. The `else if (provider === 'discord')` branch inside `triggerFederatedLogin` compared
     against the wrong variable (`provider`, a *different*, unrelated global set during Firebase
     init) instead of the function's own `providerName` parameter — meaning Discord's dedicated
     fake-UI branch was **dead code**, always falling through to the generic 7-provider fake
     template. Fixed to `providerName === 'discord'`.
- **User manually tested and confirmed working** (a real GitHub OAuth popup, real consent
  screen branded "Lumina Numerology (Dev)", successful login).

## 4. X / Twitter — done, user-confirmed working

- X's free/Default Project only allows **one App**. An existing app,
  `2096128023271477249nitro0dust` (tied to the `@nitro0dust` X account, unclear what else might
  reference it), already existed under the Default Project.
- User's choice: **reuse and rename** it rather than pay for a second project. Renamed to
  `Lumina-Numerology-Dev` (X's app-name field silently strips spaces — used hyphens instead of
  fighting that).
- Configured OAuth under the app's **User authentication settings**:
  - App permissions: Read
  - Type of App: Web App, Automated App or Bot (Confidential client)
  - Callback URI / Redirect URL: Firebase's handler URL
  - Website URL: X rejected `localhost` in *any* form (even `https://localhost:3000`) as "Not a
    valid URL format" — used the Firebase project's own default domain
    (`https://gen-lang-client-0531769124.firebaseapp.com`) as a placeholder here since this
    field is informational metadata, not functionally load-bearing for the OAuth redirect itself.
  - Saving this step **auto-generated a new OAuth 2.0 Client ID/Secret pair** — saved to `.env`
    as `LUMINA_X_OAUTH2_CLIENT_ID` / `LUMINA_X_OAUTH2_CLIENT_SECRET` for completeness, but **this
    pair is NOT what Firebase actually uses**.
- **Firebase's `TwitterAuthProvider` authenticates via OAuth 1.0a** (the "Consumer Key" /
  "Consumer Key Secret" shown under "Keys & Tokens", a completely different credential pair from
  the OAuth 2.0 one above). X only shows the last ~6 characters of these unless you
  **Regenerate** them — regenerating invalidates the old pair (and any Access Token issued under
  it, e.g. the existing one for `@nitro0dust`). **Confirmed with the user before regenerating**
  given that impact. New values saved as `LUMINA_X_CONSUMER_KEY` / `LUMINA_X_CONSUMER_SECRET`.
- Enabled the **Twitter** provider in Firebase with the Consumer Key/Secret pair (labeled "API
  Key" / "API secret" in Firebase's UI — same thing).
- Code: added a `providerName === 'twitter'` branch calling real
  `new firebase.auth.TwitterAuthProvider()` via `signInWithPopup`, same pattern as GitHub/Google.
- **User manually tested and confirmed working.**

## 5. Facebook — done, user-confirmed working

- No existing Facebook developer app at all — created one fresh via developers.facebook.com,
  named `Lumina-Numerology-Dev` (spaces worked fine here, unlike X).
- Use case selected: **"Authenticate and request data from users with Facebook Login"**.
- Business portfolio step: chose **"I don't want to connect a business portfolio yet"** — there
  was one existing, unrelated business portfolio on the account; connecting it would have
  entangled Lumina with something unrelated for no benefit.
- Publishing requirements (Business verification, App Review) were **left incomplete on
  purpose** — both are only required to go live/public; the app works fine for the
  account-owner's own testing while in Development/Unpublished mode, which is all this session
  needed.
- Credentials, all under **App settings → Basic** (and Advanced for the Client Token):
  - App ID → `LUMINA_FB_APP_ID`
  - Client Token (Advanced tab, visible in plaintext, no re-auth needed) → `LUMINA_FB_CLIENT_TOKEN`
  - App Secret (masked; revealing it required a Facebook password re-entry dialog) → `LUMINA_FB_APP_SECRET`
  - **Gotcha**: the password re-auth dialog's "Confirm" button did not respond to automated
    clicks at all (several attempts, including keyboard Enter) — **required the user to click it
    manually** each time it appeared. Root cause not confirmed, but consistent with anti-bot
    protection specifically on security-sensitive re-auth flows (this was not an issue for
    Twitter/GitHub/Microsoft's non-password-gated secret reveals).
  - Once revealed, the secret's display field was too narrow to show the whole 32-char value at
    once — **read it reliably via `read_page`'s accessibility tree** (`textbox` node exposes the
    full `value` as text) rather than trying to scroll/zoom pixel-by-pixel, which is what caused
    the earlier GitHub misread. This became the standard method for the rest of the session.
- Redirect URI: added under the Facebook Login use case's own **Settings** tab → "Valid OAuth
  Redirect URIs" → Firebase's handler URL. (Client OAuth login / Web OAuth login were already
  Yes by default.)
- Enabled the **Facebook** provider in Firebase with App ID + App Secret.
- Code: added a `providerName === 'facebook'` branch calling real
  `new firebase.auth.FacebookAuthProvider()` (scope `email`) via `signInWithPopup`.
- **User manually tested and confirmed working.**

## 6. Microsoft — wired and enabled; live test pending at time of writing

- No existing Azure/Entra app — created one fresh via portal.azure.com → App registrations, name
  `Lumina Numerology Dev` (spaces fine here too), logged in as `nitr0dust@outlook.com`.
- **Supported account types: "Any Entra ID Tenant + Personal Microsoft accounts"** — the
  broadest option, so any Microsoft account (personal or work/school) can sign in, matching how
  the other 4 real providers behave for any user.
- Redirect URI set at registration time: platform **Web**, URI = Firebase's handler URL.
- Credentials:
  - Application (client) ID → `LUMINA_MS_CLIENT_ID`
  - Directory (tenant) ID → `LUMINA_MS_TENANT_ID` (saved for reference; not currently used by
    the Firebase-side config, which defaults to accepting any tenant given the account-type
    choice above)
  - Client secret, created under **Certificates & secrets** (description "Lumina Firebase
    auth", expires 4/3/2027) → `LUMINA_MS_CLIENT_SECRET`. Read reliably via the `find` tool
    against the accessibility tree (same reliable method as Facebook's secret) — the table's
    displayed value was truncated with a "Copy to clipboard" affordance but no visible full text.
- Enabled the **Microsoft** provider in Firebase with the Application (client) ID + secret
  (Firebase's UI calls them "Application ID" / "Application secret").
- Code: added a `providerName === 'microsoft'` branch calling real
  `new firebase.auth.OAuthProvider('microsoft.com')` (with `prompt: 'select_account'`) via
  `signInWithPopup`.
- **As of the last message in this session, the user had not yet confirmed the live popup test
  succeeded** — this is the one open item. See `handoff.md`.

## 7. Final state of all 9 providers

| Provider | Real or fake | Notes |
|---|---|---|
| Google | ✅ Real | Fixed `localhost` authorized-domain issue; user-confirmed |
| GitHub | ✅ Real | Fresh dedicated app; user-confirmed |
| X / Twitter | ✅ Real | Reused/renamed existing app; user-confirmed |
| Facebook | ✅ Real | Fresh app, Development mode; user-confirmed |
| Microsoft | ✅ Real (code+config done) | **Live test not yet confirmed by user** |
| LinkedIn | ❌ Still fake | Tier 2 — needs custom backend, out of scope this session |
| Instagram | ❌ Still fake | Tier 2 — same as LinkedIn |
| Discord | ❌ Still fake | Tier 2 — same; also had the dead-code bug noted above (now fixed, but still routes to the fake template since `providerName === 'discord'` never got a real branch) |
| Yahoo | ❌ Still fake | Was in the original Tier 1 scope list but never actually reached |

## 9. Tier 2 — Discord wired to real OAuth (2026-09-08), LinkedIn/Instagram deferred

User chose to tackle Tier 2 (LinkedIn, Instagram, Discord — none natively supported by Firebase
Auth). Scope narrowed live during planning:
- **Instagram deferred entirely.** "Instagram API with Facebook Login" (the modern product,
  since Instagram Basic Display is being retired) only works if the signing-in account is a
  Business/Creator IG account linked to a Facebook Page the user admins — the user wasn't sure
  they had that set up, so this was dropped rather than building against an untestable flow.
- **LinkedIn deferred mid-session.** LinkedIn Developer Portal needed a login I can't perform;
  user said "not right now" when asked to log in. The server-side code is generic enough
  (`oauth-providers.ts`'s `PROVIDERS` table) that adding LinkedIn later is just one more config
  entry + one more `else if` in `index.html` — no architecture changes needed.
- **Discord: done, user-confirmed working end-to-end.**

### Architecture (new, shared by any future Tier 2 provider)

Unlike Tier 1 (Firebase's own `signInWithPopup` + built-in provider classes), Firebase has no
native LinkedIn/Discord provider — so this needed a real custom-backend OAuth exchange:

1. **`oauth-providers.ts`** (new file, repo root): a `PROVIDERS` config table (currently
   `discord`, ready for `linkedin`) each describing its authorize URL, scope, token exchange,
   and profile-fetch function. Exports `createOAuthRouter(getAdminAuth)`, an Express router with
   two generic routes:
   - `GET /:provider/start` — builds the provider's authorize URL (client ID from env, redirect
     URI computed from the request so it's `http://localhost:3000/auth/<provider>/callback` in
     dev), with a **stateless HMAC-signed `state`** param for CSRF (no session store — signed
     with `OAUTH_STATE_SECRET`, 10-minute expiry, verified via `crypto.timingSafeEqual`).
   - `GET /:provider/callback` — verifies `state`, exchanges the code server-side for an access
     token + profile, then calls Firebase Admin's `createAuth().createCustomToken(uid, {provider})`
     (uid is namespaced, e.g. `discord:123456`). Responds with a tiny HTML page that
     `postMessage`s `{type: 'LUMINA_OAUTH_SUCCESS', token, profile}` (or `_ERROR`) back to
     `window.opener` and closes itself.
2. **`server.ts`**: added a lazy `getAdminAuth()` (mirrors the existing `getDb()` pattern) that
   loads the Firebase Admin service-account JSON from `LUMINA_FIREBASE_ADMIN_SDK_PATH` and
   mints an Admin `Auth` instance; mounted `app.use("/auth", createOAuthRouter(getAdminAuth))`.
   Added `firebase-admin` as a real dependency (`npm install firebase-admin`).
3. **`index.html`**: added `startOAuthPopup(providerName, fallbackAvatar)` — opens
   `window.open('/auth/<provider>/start', ...)`, listens for the `message` event (checking
   `event.origin` and `event.data.provider`), and on success calls
   `auth.signInWithCustomToken(token)` then `submitInlineAuth(...)` using the `profile` data from
   the postMessage payload (custom-token sign-in does **not** populate `displayName`/`email`/
   `photoURL` on the Firebase user object the way federated popup sign-in does — that's why the
   server sends profile data separately rather than relying on the client reading it off
   `result.user`). Also polls `popup.closed` to detect a cancelled sign-in and restore the
   button. Replaced the old Discord fake-UI branch (hardcoded "Mystic Sage" persona) with a call
   to this helper; added a new `providerName === 'linkedin'` branch using the same helper (code
   is ready, just has no real LinkedIn app behind it yet).

### LinkedIn — done, user-confirmed working (2026-09-08, same day, continued session)

- LinkedIn Developer Portal requires the app be tied to a **LinkedIn Company Page** — a personal
  profile doesn't qualify ("For Individual Developers: API products... have a default Company
  page associated with them and you must select that default Company page to proceed"). No
  existing Page on the account, so the user created one live in the browser while watching
  (**explicit real-time permission** for me to then drive the rest via Claude-in-Chrome,
  superseding the initial caution about creating public-facing content unsupervised) — named
  "Bhasad Group of Companies". That flow auto-enrolled the Page in a **Premium Company Page**
  subscription (renews annually) as part of LinkedIn's own onboarding — not something I
  triggered, but caught its "Auto-invite to follow" toggle (which would have messaged real
  people — "Luis, Talia and 12 others") defaulting to ON during that onboarding and turned it
  off before proceeding, confirmed via the "Auto-invite was turned off" toast.
- Created app `Lumina-Numerology-Dev` (app ID `264524009`, Client ID `77npyu3t02qgfc`) tied to
  that Page. Required an App logo (square image, min 100px) — no logo asset existed anywhere in
  the repo, so generated a minimal 256x256 PNG by hand (raw PNG chunk writer in a throwaway Node
  script — no ImageMagick/PIL available in this environment) in the app's navy/gold palette (a
  gold diamond on the dark background matching `index.html`'s `--txm`/gold-button styling), then
  uploaded it via `file_upload` from the session scratchpad directory.
- Added the **"Sign In with LinkedIn using OpenID Connect"** product (the modern product — NOT
  the older r_liteprofile/r_emailaddress APIs, which are being retired) — auto-provisioned
  immediately on requesting access, no manual LinkedIn review needed.
- Auth tab: added redirect `http://localhost:3000/auth/linkedin/callback`, confirmed persisted
  after a page reload. Client Secret was already present (unlike Discord, no "Reset" needed) —
  revealed via the eye icon, read through `read_page`'s accessibility tree as usual. OAuth 2.0
  scopes section initially showed "No permissions added" right after adding the product — just
  a stale render; a page reload showed `openid`/`profile`/`email` all present.
- Credentials saved as `LUMINA_LINKEDIN_CLIENT_ID` / `LUMINA_LINKEDIN_CLIENT_SECRET`. No code
  changes needed — `oauth-providers.ts`'s `linkedin` entry and `index.html`'s `linkedin` branch
  were already written in anticipation of this (see the Tier 2 architecture section above).
- **User manually tested and confirmed working**: real LinkedIn OAuth popup, landed back in the
  app actually signed in.

Both Tier 2 providers attempted this session are now done. Only Instagram remains deferred
(see the "If continuing with Instagram" section in `handoff.md` for why and what it'd take).

### Discord — done, user-confirmed working

- No existing Discord application on the account — created fresh via
  discord.com/developers/applications, named `Lumina-Numerology-Dev` (matches the naming
  convention from Tier 1's X/Facebook apps). App ID `1546632758548234262`.
- **Gotcha: hCaptcha on app creation** — Discord threw a "Wait! Are you human?" hCaptcha
  challenge when submitting the "Create a new app" form. Per standing policy, bot-detection
  challenges are never something I solve — asked the user to complete it themselves, then
  continued once they confirmed the app existed.
- OAuth2 tab: added redirect `http://localhost:3000/auth/discord/callback`, saved. Public
  Client toggle left OFF (confidential client, so a real Client Secret is issued — required
  since the code exchange happens server-side, not in a public/native client).
- **Gotcha: MFA on secret reveal** — Discord's Client Secret field starts hidden
  ("Hidden for security"); clicking **Reset Secret** (necessary since Discord never shows the
  original auto-generated secret, only a regenerated one) triggered the account's own
  Multi-Factor Authentication prompt. Same category as Facebook's password re-auth from Tier
  1 — asked the user to complete it themselves. Read the revealed secret via `read_page`'s
  accessibility tree (`textbox` value), not a screenshot — the standard method since the
  GitHub Client-ID misread earlier this project.
- Credentials saved as `LUMINA_DISCORD_CLIENT_ID` / `LUMINA_DISCORD_CLIENT_SECRET`.
- **User manually tested and confirmed working**: real Discord OAuth popup, real consent
  screen branded "Lumina-Numerology-Dev", landed back in the app actually signed in.

### Firebase Admin SDK service-account key

- Firebase Console → Project Settings → Service Accounts (project `gen-lang-client-0531769124` /
  "lumina-numerology") → **Generate new private key**. Confirmed the "your app will lose access
  to old key" style warning doesn't apply here — Firebase allows multiple simultaneous service
  account keys, so this was non-destructive to anything else using the project.
  No MFA/captcha friction on this step (already authenticated as the project owner in Chrome).
- Downloaded JSON landed in the Windows Downloads folder as
  `gen-lang-client-0531769124-firebase-adminsdk-fbsvc-8bc09caa1e.json` — moved to
  `C:\Projects\Credentials\lumina-firebase-adminsdk.json` (never inside the repo, per the
  standing convention). Path referenced by `LUMINA_FIREBASE_ADMIN_SDK_PATH`.

### Env var plumbing — a real difference from Tier 1, worth remembering

Tier 1's provider secrets only ever needed to exist in **Firebase Console's own UI** — the
app's own server process never touched them (Firebase's hosted auth backend does the OAuth
itself). `C:\Projects\Credentials\.env` was purely this session's own record of what got typed
into Firebase Console.

**Tier 2 is different**: since `server.ts` now does its own OAuth code exchange, it genuinely
needs these values in `process.env` at runtime. `dotenv.config()` (already in `server.ts`) only
reads `./.env` relative to cwd — and **no such file existed in the repo before this session**
(confirmed via `find . -maxdepth 1 -iname ".env*"` — only `.env.example` was present). Created
`C:\Projects\Lumina-SaaS\.env` (confirmed gitignored via `git check-ignore`) holding
`LUMINA_DISCORD_CLIENT_ID/SECRET`, `LUMINA_FIREBASE_ADMIN_SDK_PATH`, and `OAUTH_STATE_SECRET` —
this is a genuinely new file needed for Tier 2 to run at all, separate from (but recording the
same values as) the master `Credentials\.env`.

### Stale dev server gotcha (new, worth remembering)

`npm run dev` failed with `EADDRINUSE: address already in use 0.0.0.0:3000` on first restart
this session — a `node.exe` process from **2026-09-05** (the previous Tier-1 session) had been
running unattended for 3 days, still serving the *old* code. `curl`ing `/auth/discord/start`
against it 404'd, which could easily be misread as "the new route is broken" when the real
problem was "you're not even talking to the new server." Found the real PID via
`netstat -ano | grep :3000`, confirmed it was the expected stale `node.exe` (via
`Get-Process -Id ... | select Path,StartTime`) before killing it. **Lesson: after any `server.ts`
change, if a curl test doesn't reflect the edit, check for a stale listener on the port before
assuming the code is wrong.**

## 11. CRITICAL: fake premium tier / no payment gateway (2026-09-08, same session as LinkedIn)

User-reported concern: "anyone can select which tier they want, premium or free, without being
a paid subscriber, and can also access all premium tools without paying anything." Investigated
before touching anything — confirmed, and the actual shape was worse than the report:

1. **The tier selector was fully client-side and defaulted to Premium.** Both profile-creation
   forms (`#inp-plan` in the calculator, `#new-plan` in "Manage Profiles") had
   `<option value="paid" selected>` — brand-new profiles were Premium by default. A one-click
   "Upgrade to Premium Tier" button (`toggleCurrentProfilePlan()` → `togglePlan(i)`) just flipped
   `profiles[i].plan` in `localStorage` with zero payment check.
2. **The "payment" flow was entirely fake.** `simulatedSurchargePayment()` (the ₹1,100 Akashic
   extra-slot purchase) accepted literally any text as a "card number", showed a fake 3.5-second
   spinner ("Exchanging spiritual & material energy..."), then granted the slot unconditionally.
   The Monthly ($11)/Yearly ($111) subscription buttons ("Manage Subscription", "Plan Details")
   just call `showToast(...)` — no checkout of any kind. No Stripe/Razorpay/PayPal SDK, keys, or
   endpoint exist anywhere in this repo, and no Lumina-specific payment credentials exist in
   `C:\Projects\Credentials\.env` either — confirmed via grep before assuming.
3. **Even server-side storage couldn't have helped as-is.** `server.ts`'s `POST /api/profiles`
   stores/returns whatever `plan` the client sends, for whatever `email` the client claims, with
   **no Firebase ID-token verification at all** — a second, independent vulnerability (anyone
   can read or overwrite anyone else's profiles by knowing/guessing their email), found while
   investigating the first one, not yet fixed (see below).
4. **A near-duplicate `toggleCurrentProfilePlan()` function existed** (two separate
   `function toggleCurrentProfilePlan(){...}` declarations in the same top-level scope). My
   first fix attempt edited the wrong one — JS keeps only the *last* declaration of a given
   function name in a scope, so the first one was silently dead code, shadowed by a second
   definition further down that called a shared `togglePlan(i)` helper (also used by the
   profile-list's per-row Upgrade/Downgrade button). **Caught this by re-reading the file for
   all declarations before trusting the first fix** — the real, live implementation is
   `togglePlan(i)`; the dead duplicate was removed and replaced with a comment pointing to it,
   rather than left as a trap for a future edit.

**User's decision, asked before doing anything irreversible:** (a) apply an immediate stopgap
now to close the free-access hole, (b) real payment gateway to build toward: **Razorpay**
(already used for KPI Hub; ₹1,100 INR pricing already present in the current fake flow suggests
India-focused pricing).

**Stopgap shipped and verified this session** (this is *not* the real fix — see handoff.md's
CRITICAL banner):
- `index.html`: both plan `<select>`s now default to `free`; the `paid` option is `disabled`
  and labeled "Coming Soon — subscribe from the Premium tab". `togglePlan(i)` (the real,
  de-duplicated implementation) now only allows `paid` → `free`; attempting `free` → `paid`
  shows a toast ("Premium subscriptions are launching soon...") and does not change anything.
  `simulatedSurchargePayment()` now only shows a toast and no longer touches
  `profiles[ai].akashicExtraSlots`. `SCHEMA_VERSION` bumped 5→6 with a migration step that
  resets every existing profile's `plan` to `'free'` regardless of prior value — since no
  "paid" profile up to this point was ever a real payment, there's nothing legitimate to
  preserve.
- `server.ts`: `POST /api/profiles` now maps every incoming profile through
  `{...p, plan: "free"}` before writing to Firestore, regardless of what the client sent —
  defense in depth alongside the client-side fix.
- **Verified directly, not just by reading the diff**: restarted the dev server (killed a stale
  PID first, confirmed via `Get-Process ... StartTime` it was this session's own process before
  killing), loaded the app in a real browser tab, confirmed via `read_page` that both selects
  render `free` selected / `paid` disabled with the new label. Used `javascript_tool` (browser
  console execution) rather than fighting through unrelated SPA navigation to exercise the
  actual functions: created a throwaway test profile, called `togglePlan()` on a `free` profile
  (blocked, correct toast, plan unchanged), set it to `paid` and called `togglePlan()` again
  (allowed, downgraded to `free`, correct toast), called `simulatedSurchargePayment()` (toast
  only, `akashicExtraSlots` unchanged) — then deleted the test profile. `npm run lint`
  (`tsc --noEmit`) clean on the `server.ts` change.
- A live `curl -X POST /api/profiles` with `plan:"paid"` got `PERMISSION_DENIED` from Firestore
  itself before ever reaching my sanitization logic's effect being externally observable — a
  **separate, pre-existing Firestore rules behavior**, not something this session touched or
  root-caused further. Worth knowing about but out of scope for this fix.

**Still open, genuinely unresolved — do not consider this "fixed" until these exist:**
- `/api/profiles` has no auth check at all (point 3 above). Needs Firebase ID-token
  verification middleware (verify the token server-side via the Admin SDK we already wired up
  for Tier 2 OAuth, extract the UID, and use *that* — never a client-supplied email — as the
  Firestore document key).
- No real payment gateway exists. Razorpay was the user's choice; building this out is a
  distinct, substantial follow-up (Razorpay account/keys, checkout UI, a webhook endpoint that
  verifies Razorpay's payment signature server-side, and entitlement storage keyed to the
  verified Firebase UID that every premium-gated feature actually checks against — not the
  `plan` field on a client-supplied profile object, which is architecturally the wrong place
  for this regardless of how well-guarded the write path is).
- Today's stopgap makes the app **free-tier-only** — nobody, including a real future paying
  customer, can become Premium until the real integration exists. That trade-off was explicit
  and user-approved, not an oversight.

## 10. Where every credential lives

All in `C:\Projects\Credentials\.env`, under a `# LUMINA-SAAS — ...` comment block per provider,
appended in this order: GitHub → X (OAuth2 pair, then the real OAuth 1.0a pair) → Facebook →
Microsoft. Variable names only, listed above per section. **This `.env` file is outside any git
repo** — the standing convention for this whole `C:\Projects` working environment (see
`C:\Projects\CLAUDE.md`) is to never paste raw secret values into chat, commits, or any file
tracked by git — including this one.
