# Lumina-SaaS — session memory (started 2026-09-05, most recently updated 2026-09-09)

Detailed, dated, chronological log of everything done to this repo/app across every session.
Kept inside the repo so it travels with the code. See also `handoff.md` (next-step instructions,
read that first for "what to actually do next") and the global skill `lumina-saas`
(`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-equivalent digest
loadable from any working directory.

**Never commit real secret values to this file or anywhere else in this repo.** All credentials
referenced below live only in `C:\Projects\Credentials\.env` (outside any git repo) under the
`LUMINA_*` variable names — this file names the variables, never the values. Section 14 lists
every credential and exactly where it lives.

---

## 1. Repo basics

- GitHub: `hsharmagxi-debug/Lumina-SaaS` (private). Local clone: `C:\Projects\Lumina-SaaS`.
- Stack: Vite + React + Express. `server.ts` is the dev entry (`npm run dev` → `tsx server.ts`,
  serves on `http://localhost:3000`). Single large `index.html` holds essentially the whole
  front-end (styles, markup, and a big inline `<script>` with all app logic).
- Firebase project backing auth: **`gen-lang-client-0531769124`** (display name in Firebase
  Console: "lumina-numerology"), authDomain `gen-lang-client-0531769124.firebaseapp.com`. This
  is an AI-Studio-generated app — same config values are baked into `firebase-applet-config.json`
  at repo root and into `index.html`'s inline `firebaseConfig` object. This project uses a
  **named** Firestore database (`ai-studio-luminanumerology-aedb98cd-...`, read from
  `firebase-applet-config.json`'s `firestoreDatabaseId`), not the default one — matters for any
  future Admin SDK code, see section 12.
- `npm install` and `npm run dev` both verified working cleanly (284 packages, 3 moderate
  non-blocking vulnerabilities, as of the initial audit).

## 2. Initial audit (2026-09-05) — found 8 of 9 login providers were fake

The sign-in modal ("SIGN IN / REGISTER") offers 9 providers: Google, LinkedIn, GitHub,
Instagram, Facebook, X/Twitter, Yahoo, Microsoft, Discord.

**Before any of this work**, only Google was real (genuine Firebase `signInWithPopup` +
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

## 3. Scope decision for wiring up the rest

User chose **"Tier 1 only"** first: providers Firebase supports natively (no custom backend
needed) — GitHub, Facebook, X/Twitter, Microsoft, Yahoo. LinkedIn, Instagram, and Discord were
intentionally left fake at this point (Tier 2 — would need a custom backend + Firebase Admin SDK
+ service-account key, tackled in a later session — see section 9).

### 3a. GitHub — done, user-confirmed working

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
    zooming into a screenshot** — this became the standard method for every credential read for
    the rest of the project, with zero further misreads.
- Enabled the **GitHub** provider in Firebase Authentication → Sign-in method, with that Client
  ID/Secret. Callback URL auto-matched.
- Code: `index.html`'s `triggerFederatedLogin('github')` branch rewritten to call real
  `new firebase.auth.GithubAuthProvider()` (scope `user:email`) via `auth.signInWithPopup(p)`,
  mirroring the existing Google branch's pattern (loading-state button swap, `.then`/`.catch`,
  `submitInlineAuth(...)` on success).
- **Detour that was reverted**: tried switching to `signInWithRedirect` purely so browser
  automation could drive the flow end-to-end (a popup opens a separate OS-level window
  automation tools cannot see or control). The redirect *did* complete a real GitHub authorize
  round-trip, but `auth.getRedirectResult()` came back empty afterward — root cause is a genuine,
  documented Firebase limitation: redirect-based sign-in needs third-party storage access
  between the app's origin (`localhost:3000`) and the Firebase authDomain (`*.firebaseapp.com`),
  which modern Chrome's storage partitioning blocks by default, especially on `localhost`. This
  would likely affect real users testing locally too, not just automation. **Reverted GitHub
  back to `signInWithPopup`** and added a `getRedirectResult()` handler near Firebase init anyway
  (harmless no-op for popup flows).
- **Two unrelated pre-existing bugs fixed along the way**:
  1. `closeAuthModal()` never reset which inner view (`auth-initial-view` vs
     `auth-provider-view`) was showing — reopening the modal after a real-auth attempt that
     didn't finish left it blank. Fixed by calling `goBackToAuthInitial()` from
     `closeAuthModal()`, and also from the error-catch blocks.
  2. The `else if (provider === 'discord')` branch inside `triggerFederatedLogin` compared
     against the wrong variable (`provider`, an unrelated global set during Firebase init)
     instead of the function's own `providerName` parameter — Discord's dedicated fake-UI branch
     was **dead code**, always falling through to the generic 7-provider fake template. Fixed to
     `providerName === 'discord'`.
- **User manually tested and confirmed working** (a real GitHub OAuth popup, real consent
  screen branded "Lumina Numerology (Dev)", successful login).

### 3b. X / Twitter — done, user-confirmed working

- X's free/Default Project only allows **one App**. An existing app,
  `2096128023271477249nitro0dust` (tied to the `@nitro0dust` X account), already existed under
  the Default Project.
- User's choice: **reuse and rename** it rather than pay for a second project. Renamed to
  `Lumina-Numerology-Dev` (X's app-name field silently strips spaces — used hyphens instead of
  fighting that).
- Configured OAuth under the app's **User authentication settings**:
  - App permissions: Read
  - Type of App: Web App, Automated App or Bot (Confidential client)
  - Callback URI / Redirect URL: Firebase's handler URL
  - Website URL: X rejected `localhost` in *any* form (even `https://localhost:3000`) as "Not a
    valid URL format" — used the Firebase project's own default domain as a placeholder here
    since this field is informational metadata, not functionally load-bearing.
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

### 3c. Facebook — done, user-confirmed working

- No existing Facebook developer app at all — created one fresh via developers.facebook.com,
  named `Lumina-Numerology-Dev` (spaces worked fine here, unlike X).
- Use case selected: **"Authenticate and request data from users with Facebook Login"**.
- Business portfolio step: chose **"I don't want to connect a business portfolio yet"** — there
  was one existing, unrelated business portfolio on the account; connecting it would have
  entangled Lumina with something unrelated for no benefit.
- Publishing requirements (Business verification, App Review) were **left incomplete on
  purpose** — both are only required to go live/public; the app works fine for the
  account-owner's own testing while in Development/Unpublished mode.
- Credentials, all under **App settings → Basic** (and Advanced for the Client Token):
  - App ID → `LUMINA_FB_APP_ID`
  - Client Token (Advanced tab, visible in plaintext, no re-auth needed) → `LUMINA_FB_CLIENT_TOKEN`
  - App Secret (masked; revealing it required a Facebook password re-entry dialog) → `LUMINA_FB_APP_SECRET`
  - **Gotcha**: the password re-auth dialog's "Confirm" button did not respond to automated
    clicks at all — **required the user to click it manually**. Not an issue for
    Twitter/GitHub/Microsoft's non-password-gated secret reveals.
  - Once revealed, the secret's display field was too narrow to show the whole value at once —
    **read it reliably via `read_page`'s accessibility tree** rather than scrolling/zooming
    pixel-by-pixel. This became the standard method for the rest of the project.
- Redirect URI: added under the Facebook Login use case's own **Settings** tab → "Valid OAuth
  Redirect URIs" → Firebase's handler URL.
- Enabled the **Facebook** provider in Firebase with App ID + App Secret.
- Code: added a `providerName === 'facebook'` branch calling real
  `new firebase.auth.FacebookAuthProvider()` (scope `email`) via `signInWithPopup`.
- **User manually tested and confirmed working.**

### 3d. Microsoft — done, user-confirmed working

- No existing Azure/Entra app — created one fresh via portal.azure.com → App registrations, name
  `Lumina Numerology Dev`, logged in as `nitr0dust@outlook.com`.
- **Supported account types: "Any Entra ID Tenant + Personal Microsoft accounts"** — the
  broadest option, so any Microsoft account (personal or work/school) can sign in.
- Redirect URI set at registration time: platform **Web**, URI = Firebase's handler URL.
- Credentials:
  - Application (client) ID → `LUMINA_MS_CLIENT_ID`
  - Directory (tenant) ID → `LUMINA_MS_TENANT_ID` (saved for reference; not used by the
    Firebase-side config, which defaults to accepting any tenant given the account-type choice)
  - Client secret, created under **Certificates & secrets** (expires 4/3/2027) →
    `LUMINA_MS_CLIENT_SECRET`. Read reliably via `find` against the accessibility tree.
- Enabled the **Microsoft** provider in Firebase with the Application (client) ID + secret.
- Code: added a `providerName === 'microsoft'` branch calling real
  `new firebase.auth.OAuthProvider('microsoft.com')` (with `prompt: 'select_account'`) via
  `signInWithPopup`.
- **User manually tested and confirmed working** in a later pass of the same session (was the
  one open item at one point; resolved before Tier 1 was declared fully done).

### 3e. Final state of Tier 1 (all 5 Firebase-native providers)

| Provider | Status |
|---|---|
| Google | ✅ Real, user-confirmed |
| GitHub | ✅ Real, user-confirmed |
| X / Twitter | ✅ Real, user-confirmed |
| Facebook | ✅ Real, user-confirmed |
| Microsoft | ✅ Real, user-confirmed |
| Yahoo | ❌ Still fake — never actually reached (was in original Tier 1 scope, dropped implicitly) |

Yahoo (Tier 1, Firebase-native) remains open — see `handoff.md`. Would follow the same pattern
as Microsoft/Facebook: create a Yahoo Developer app, enable the Yahoo provider in Firebase
Console, add a `providerName === 'yahoo'` branch using
`signInWithPopup(new firebase.auth.OAuthProvider('yahoo.com'))` — does NOT need the Tier 2
custom-backend flow below, since Yahoo *is* natively supported by Firebase Auth.

---

## 4. Tier 2 (2026-09-08) — Discord + LinkedIn wired to real OAuth, Instagram deferred

User chose to tackle Tier 2 (LinkedIn, Instagram, Discord — none natively supported by Firebase
Auth). Scope narrowed live during planning:
- **Instagram deferred entirely.** "Instagram API with Facebook Login" (the modern product,
  since Instagram Basic Display is being retired) only works if the signing-in account is a
  Business/Creator IG account linked to a Facebook Page the user admins — the user wasn't sure
  they had that set up, so this was dropped rather than building against an untestable flow.
  (Re-confirmed still true on 2026-09-09 — see section 13.)
- **LinkedIn deferred mid-session, then picked back up same day.** LinkedIn Developer Portal
  needed a login I can't perform; user said "not right now" initially, then came back to it.
- **Discord: done first, user-confirmed working end-to-end.**

### 4a. Architecture (shared by any Tier 2 provider, including a future Instagram)

Unlike Tier 1 (Firebase's own `signInWithPopup` + built-in provider classes), Firebase has no
native LinkedIn/Discord/Instagram provider — so this needed a real custom-backend OAuth exchange:

1. **`oauth-providers.ts`** (new file, repo root): a `PROVIDERS` config table (`discord`,
   `linkedin`) each describing its authorize URL, scope, token exchange, and profile-fetch
   function. Exports `createOAuthRouter(getAdminAuth)`, an Express router with two generic
   routes:
   - `GET /:provider/start` — builds the provider's authorize URL (client ID from env, redirect
     URI computed from the request), with a **stateless HMAC-signed `state`** param for CSRF (no
     session store — signed with `OAUTH_STATE_SECRET`, 10-minute expiry, verified via
     `crypto.timingSafeEqual`).
   - `GET /:provider/callback` — verifies `state`, exchanges the code server-side for an access
     token + profile, then calls Firebase Admin's `createCustomToken(uid, {provider})` (uid is
     namespaced, e.g. `discord:123456`). Responds with a tiny HTML page that `postMessage`s
     `{type: 'LUMINA_OAUTH_SUCCESS', token, profile}` (or `_ERROR`) back to `window.opener` and
     closes itself.
2. **`server.ts`**: added a lazy `getAdminAuth()` that loads the Firebase Admin service-account
   JSON and mints an Admin `Auth` instance; mounted `app.use("/auth", createOAuthRouter(getAdminAuth))`.
   Added `firebase-admin` as a real dependency.
3. **`index.html`**: added `startOAuthPopup(providerName, fallbackAvatar)` — opens
   `window.open('/auth/<provider>/start', ...)`, listens for the `message` event (checking
   `event.origin` and `event.data.provider`), and on success calls
   `auth.signInWithCustomToken(token)` then `submitInlineAuth(...)` using the `profile` data from
   the postMessage payload (**custom-token sign-in does NOT populate `displayName`/`email`/
   `photoURL`** on the Firebase user object the way federated popup sign-in does — that's why the
   server sends profile data separately). Also polls `popup.closed` to detect a cancelled
   sign-in and restore the button.

Adding a new Tier 2 provider (e.g. Instagram, once its prerequisite is met) is just: one more
`PROVIDERS` entry + one more `else if (providerName === '...')` branch calling
`startOAuthPopup(...)`. No architecture changes needed.

### 4b. Discord — done, user-confirmed working

- No existing Discord application on the account — created fresh via
  discord.com/developers/applications, named `Lumina-Numerology-Dev`. App ID
  `1546632758548234262`.
- **Gotcha: hCaptcha on app creation** — Discord threw a "Wait! Are you human?" hCaptcha
  challenge when submitting the "Create a new app" form. Per standing policy, bot-detection
  challenges are never something I solve — asked the user to complete it themselves.
- OAuth2 tab: added redirect `http://localhost:3000/auth/discord/callback`, saved. Public
  Client toggle left OFF (confidential client, so a real Client Secret is issued).
- **Gotcha: MFA on secret reveal** — Discord's Client Secret field starts hidden; clicking
  **Reset Secret** (necessary since Discord never shows the original auto-generated secret)
  triggered the account's own Multi-Factor Authentication prompt. Asked the user to complete it
  themselves. Read the revealed secret via `read_page`'s accessibility tree.
- Credentials saved as `LUMINA_DISCORD_CLIENT_ID` / `LUMINA_DISCORD_CLIENT_SECRET`.
- **User manually tested and confirmed working**: real Discord OAuth popup, real consent
  screen branded "Lumina-Numerology-Dev", landed back in the app actually signed in.

### 4c. LinkedIn — done, user-confirmed working (same day, picked back up)

- LinkedIn Developer Portal requires the app be tied to a **LinkedIn Company Page** — a personal
  profile doesn't qualify. No existing Page on the account, so the user created one live in the
  browser while watching (**explicit real-time permission** for me to then drive the rest via
  Claude-in-Chrome, superseding the initial caution about creating public-facing content
  unsupervised) — named "Bhasad Group of Companies". That flow auto-enrolled the Page in a
  **Premium Company Page** subscription (renews annually) as part of LinkedIn's own onboarding —
  not something I triggered, but caught its "Auto-invite to follow" toggle (which would have
  messaged real people) defaulting to ON and turned it off before proceeding.
- Created app `Lumina-Numerology-Dev` (app ID `264524009`, Client ID `77npyu3t02qgfc`) tied to
  that Page. Required an App logo — none existed anywhere in the repo, so generated a minimal
  256×256 PNG by hand (raw PNG chunk writer in a throwaway Node script — no ImageMagick/PIL
  available) in the app's navy/gold palette, then uploaded it via `file_upload`.
- Added the **"Sign In with LinkedIn using OpenID Connect"** product (the modern product — NOT
  the older r_liteprofile/r_emailaddress APIs, which are being retired) — auto-provisioned
  immediately, no manual LinkedIn review needed.
- Auth tab: added redirect `http://localhost:3000/auth/linkedin/callback`, confirmed persisted
  after a page reload. Client Secret was already present — revealed via the eye icon, read
  through `read_page`'s accessibility tree. OAuth 2.0 scopes section initially showed "No
  permissions added" right after adding the product — just a stale render; a page reload showed
  `openid`/`profile`/`email` all present.
- Credentials saved as `LUMINA_LINKEDIN_CLIENT_ID` / `LUMINA_LINKEDIN_CLIENT_SECRET`. No code
  changes needed — `oauth-providers.ts`'s `linkedin` entry and `index.html`'s `linkedin` branch
  were already written in anticipation of this.
- **User manually tested and confirmed working**: real LinkedIn OAuth popup, landed back in the
  app actually signed in.

### 4d. Firebase Admin SDK service-account key

- Firebase Console → Project Settings → Service Accounts → **Generate new private key**.
  Firebase allows multiple simultaneous service account keys, so this was non-destructive to
  anything else using the project.
- Downloaded JSON moved to `C:\Projects\Credentials\lumina-firebase-adminsdk.json` (never inside
  the repo). Path referenced by `LUMINA_FIREBASE_ADMIN_SDK_PATH` (local dev) and later
  `LUMINA_FIREBASE_ADMIN_SDK_JSON` (inline content, for Railway — see section 12).

### 4e. Env var plumbing — a real difference from Tier 1

Tier 1's provider secrets only ever needed to exist in **Firebase Console's own UI** — the
app's own server process never touched them. `C:\Projects\Credentials\.env` was purely a record
of what got typed into Firebase Console.

**Tier 2 is different**: since `server.ts` does its own OAuth code exchange, it genuinely needs
these values in `process.env` at runtime. `dotenv.config()` only reads `./.env` relative to cwd
— and **no such file existed in the repo before Tier 2** (confirmed via
`find . -maxdepth 1 -iname ".env*"` — only `.env.example` was present). Created
`C:\Projects\Lumina-SaaS\.env` (confirmed gitignored via `git check-ignore`) — a genuinely new
file needed for Tier 2 to run at all, separate from (but recording the same values as) the
master `Credentials\.env`.

### 4f. Stale dev server gotcha (recurred multiple times this project — always check)

`npm run dev` failed with `EADDRINUSE: address already in use 0.0.0.0:3000` on restart more than
once across sessions — a `node.exe` process from a *previous* session had been running
unattended, still serving the *old* code. Testing against it produces confusing results that
look like "the new code is broken" when the real problem is "you're not even talking to the new
server." **Standing lesson: after any `server.ts` change, if a curl test doesn't reflect the
edit, check for a stale listener first** — `netstat -ano | grep :3000`, confirm the PID via
`Get-Process -Id ... | select Path,StartTime` before killing it (never kill blind).

---

## 5. CRITICAL security finding (2026-09-08): fake premium tier / no payment gateway

User-reported concern: "anyone can select which tier they want, premium or free, without being
a paid subscriber, and can also access all premium tools without paying anything." Investigated
before touching anything — confirmed, and the actual shape was worse than the report:

1. **The tier selector was fully client-side and defaulted to Premium.** Both profile-creation
   forms (`#inp-plan`, `#new-plan`) had `<option value="paid" selected>` — brand-new profiles
   were Premium by default. A one-click "Upgrade to Premium Tier" button just flipped
   `profiles[i].plan` in `localStorage` with zero payment check.
2. **The "payment" flow was entirely fake.** `simulatedSurchargePayment()` (the ₹1,100 Akashic
   extra-slot purchase) accepted literally any text as a "card number", showed a fake 3.5-second
   spinner, then granted the slot unconditionally. The Monthly ($11)/Yearly ($111) subscription
   buttons just called `showToast(...)` — no checkout of any kind. No Stripe/Razorpay/PayPal
   SDK, keys, or endpoint existed anywhere, and no Lumina-specific payment credentials existed
   in `C:\Projects\Credentials\.env` either — confirmed via grep before assuming.
3. **Even server-side storage couldn't have helped as-is.** `server.ts`'s `POST /api/profiles`
   stored/returned whatever `plan` the client sent, for whatever `email` the client claimed, with
   **no Firebase ID-token verification at all** — a second, independent vulnerability (anyone
   could read or overwrite anyone else's profiles by knowing/guessing their email).
4. **A near-duplicate `toggleCurrentProfilePlan()` function existed** — two separate
   `function toggleCurrentProfilePlan(){...}` declarations in the same top-level scope. First fix
   attempt edited the wrong one — JS keeps only the *last* declaration of a given name in a
   scope, so the first was silently dead code, shadowed by a second definition further down that
   called a shared `togglePlan(i)` helper. **Caught by re-reading the file for all declarations
   before trusting the first fix.**

**User's decision, asked before doing anything irreversible:** (a) apply an immediate stopgap
now to close the free-access hole, (b) real payment gateway to build toward: **Razorpay**
(already used for KPI Hub; ₹1,100 INR pricing already present in the fake flow suggested
India-focused pricing).

**Stopgap shipped and verified same day** (this was later superseded by the real fix — see
section 6):
- `index.html`: both plan `<select>`s defaulted to `free`; `paid` disabled and labeled "Coming
  Soon". `togglePlan(i)` allowed only `paid` → `free`. `simulatedSurchargePayment()` stopped
  granting anything. `SCHEMA_VERSION` bumped 5→6, migration reset every existing profile's
  `plan` to `'free'` regardless of prior value.
- `server.ts`: `POST /api/profiles` mapped every incoming profile through `{...p, plan: "free"}`
  before writing to Firestore, regardless of what the client sent.
- **Verified directly, not just by reading the diff**: restarted the dev server (confirmed the
  killed PID was this session's own via `Get-Process ... StartTime` first), loaded the app in a
  real browser tab, confirmed via `read_page` that both selects rendered correctly. Used
  `javascript_tool` (browser console execution) to exercise the actual functions directly:
  created a throwaway test profile, called `togglePlan()` on a `free` profile (blocked, correct
  toast), set it to `paid` and called again (allowed, downgraded, correct toast), called
  `simulatedSurchargePayment()` (toast only, no grant) — then deleted the test profile.
  `tsc --noEmit` clean.
- A live `curl -X POST /api/profiles` with `plan:"paid"` got `PERMISSION_DENIED` from Firestore
  itself — a separate, pre-existing Firestore rules behavior, not caused by or fixed in this
  pass, just noted.

**What the stopgap deliberately did NOT fix (both closed in later sections):**
- `/api/profiles` had no auth check at all — fixed in section 6 (Firebase ID-token
  `verifyAuth` middleware).
- No real payment gateway existed — fixed (architecturally) in section 6, still pending real
  Razorpay keys as of section 13.

---

## 6. Real Razorpay billing built + first live deployment (2026-09-08, later same session)

User explicitly asked to bind Razorpay to "3 recommended packages" in the live app and complete
the architecture "in proper sequence." This section covers the full build; section 7 covers
getting it actually live on Railway.

### 6a. Package design

Three real, payment-verified packages, matching the "Lumina Premium Blueprint" plan (artifact
published earlier the same session, link in `handoff.md`):
- **Premium Monthly** — ₹299/month, Razorpay Subscriptions API.
- **Premium Yearly** — ₹2,499/year, Razorpay Subscriptions API.
- **Insight Credits** — ₹49 single / ₹199 for 5, Razorpay Orders API (one-off, not recurring).

### 6b. `billing.ts` (new file)

- Razorpay Plans (Monthly/Yearly) are created once via the API and cached in Firestore
  (`config/razorpay_plans_{test|live}` — separate cache per key mode, since test and live keys
  have entirely separate Plan IDs), not hand-clicked in the dashboard.
- Routes, all mounted at `/api/billing`:
  - `GET /entitlement` (auth) — returns the caller's current plan + AI credits + the 3 package
    definitions, for the client to render.
  - `POST /create-subscription` (auth) — creates a Razorpay Subscription for Monthly/Yearly,
    returns `{subscriptionId, keyId}` for client-side Checkout.js. No money moves here; this
    only registers intent.
  - `POST /create-order` (auth) — creates a Razorpay Order for Insight Credits.
  - `POST /webhook` — **the only writer of entitlement state** (`entitlements/{uid}` in
    Firestore). Verifies `X-Razorpay-Signature` via HMAC (using `req.rawBody`, captured by a
    `verify` callback added to `server.ts`'s `express.json()` — signature verification needs
    the exact original bytes, not a re-serialized copy) before trusting anything in the payload.
    Handles `subscription.activated`/`charged` (grants `plan: "premium"` + resets AI credits to
    the fair-use allowance), `subscription.cancelled`/`completed`/`expired` (reverts to
    `plan: "free"`), and `payment.captured` for Insight Credits (increments
    `aiCreditsRemaining`).
  - `POST /cancel-subscription` (auth) — cancels at the end of the current billing period via
    Razorpay's API (`cancel(id, false)`), not immediately.
- `spendAiCredit(db, uid)` — exported helper, decrements `aiCreditsRemaining` atomically and
  returns whether the caller is entitled to spend one (must be `plan: "premium"` with
  `aiCreditsRemaining > 0`). Built here, wired into the actual AI routes later (section 13).

### 6c. `server.ts` changes

- `getAdminAuth()` split into `getAdminApp()` / `getAdminAuth()` / `getAdminDb()` so Auth and
  Firestore share one initialized admin app.
- New `verifyAuth` middleware: verifies a Firebase ID token from `Authorization: Bearer <token>`,
  attaches the real `uid` to the request.
- `/api/profiles` migrated **off** the old client-supplied-email model onto `verifyAuth` + the
  caller's real `uid` — closes the auth hole flagged in section 5.
- `/api/consult` and `/api/akashic` gated behind `verifyAuth` too (at this point, NOT yet behind
  payment — see the naming-issue detour in section 6d below for why, and section 13 for how that
  was later resolved and the credit-spend gate actually wired in).
- `LUMINA_FIREBASE_ADMIN_SDK_JSON` (inline key content) added alongside the existing `_PATH`
  (local file), so a host without this filesystem (Railway) can configure the same credential
  via a plain env var.

### 6d. A second real finding, discovered while researching pricing/positioning: the naming issue

Before touching the pricing/copy, researched the app's existing AI feature (the "Master
Consensus Engine", `/api/consult`) and found: its prompt generates readings explicitly in the
voice of **5 real, named people** — Dr. J C Chaudhry, Sanjay B. Jumaani, Dr. Kartick
Chakraborty, Anupam V. Kapil, Rajat Nayar. Checked via web search (not assumed): at least the
first two are real, currently active, prominent professional numerologists in India who run
their own paid consultancies (Dr. Chaudhry's is Guinness-recognised, 40 years,
jcchaudhry.com / Chaudhry Nummero Pvt. Ltd.), with nothing in the codebase suggesting their
knowledge or consent. Flagged as a genuine legal/reputational exposure (false endorsement),
independent of the payment work — **decision at the time: hold Category E (Consensus + Akashic)
back from the paid packages** (keep it free/unlisted) rather than monetize something built on
an unresolved impersonation risk. This was reversed once the naming was actually fixed — see
section 13.

Also researched competitive positioning honestly rather than asserting an unverifiable "world
first": multi-system AI synthesis is **not** unique to Lumina (jenova.ai's "AI Numerology
Reader" already does it) — the defensible claim is the specific 5-system + forecast +
correction-tools bundle, not an unverifiable superlative. Full reasoning, pricing rationale, and
the 5-category breakdown are in the published artifact: **"Lumina Premium Blueprint"**
(https://claude.ai/code/artifact/d53e2240-2e54-46b6-a4cd-e689a0140434).

### 6e. `index.html` changes

- Real Razorpay Checkout.js (`https://checkout.razorpay.com/v1/checkout.js`) wired to the 3
  packages on the Premium tab, replacing the fake "Manage Subscription"/"Plan Details" buttons
  and the fake ₹1,100 Akashic slot purchase.
- Premium is now **account-wide** (one subscription covers every profile on the account, since
  entitlements are keyed to the Firebase uid, not a per-profile field) — `renderDash()`'s
  `body.free-tier` toggle (the single mechanism every premium-lock-overlay in the app depends
  on) now reads a client-side cache of the server-verified entitlement (`serverEntitlement`,
  refreshed via `fetchEntitlement()` on every `auth.onAuthStateChanged`), not the old
  per-profile, spoofable `plan` field.
- `togglePlan(i)`/`toggleCurrentProfilePlan()` repurposed to route to the real checkout/cancel
  flow (via the Premium tab) instead of flipping a local flag.

---

## 7. Getting it actually live: Railway deployment (2026-09-08)

No hosting existed for this app before this point — `npm run dev` on localhost was the whole
story.

### 7a. Razorpay account: existing account not usable, new one required

The only available Razorpay account's live key (`rzp_live_...`) is approved for `thekpihub.com`
only — Razorpay's own UI states additional websites on one account must share the same business
model as the first, and numerology subscriptions vs. B2B SaaS analytics don't. **User chose to
create a separate, new Razorpay account for Lumina** rather than misdeclare the business model.
That signup (KYC included) is the user's own action — **still pending as of section 13's
status check-in on 2026-09-09.** Real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
`RAZORPAY_WEBHOOK_SECRET` are not wired in anywhere yet; `billing.ts`'s routes report "not
configured" gracefully until they are.

### 7b. Railway project setup

Created a fresh Railway project (id `f1cea083-aaf5-4ee9-90c5-47f7f64d8995`, workspace "Himanshu
Sharma's Projects" — deliberately NOT reusing `jubilant-growth`/`trade-cio-ashu`/
`captivating-achievement`, all unrelated). Service `lumina-web` (id
`e64e7e60-5596-48af-ba2d-b83b5a51890c`), deployed from `hsharmagxi-debug/Lumina-SaaS` main
branch. Live domain: **https://lumina-web-production-b8df.up.railway.app**.

**Gotcha: Railway's GitHub App wasn't installed on `hsharmagxi-debug` at all** (only on the
`thekpihub` org and one other personal repo) — `connect-service-source` failed with "User does
not have access to the repo." Diagnosed by checking github.com/settings/installations directly
rather than guessing. Fixed by navigating straight to
`https://github.com/apps/railway-app/installations/new` (same-tab, avoids the popup-window
problem Railway's own in-dashboard "Configure GitHub App" link hits) and installing it scoped to
just this one repo (not "All repositories" — least privilege). Needed the user for the GitHub
sudo-mode 2FA step.

### 7c. Three real bugs found and fixed by actually curling the live site, not by trusting a green deploy

Each of these would have shipped silently broken otherwise:

1. **Build failure: `bun install --frozen-lockfile` exit 1.** Railway's Railpack builder
   auto-detects a package manager from whichever lockfile it finds; it found `bun.lock` (a
   leftover — `git log` confirms it was added exactly once, in the original AI-Studio scaffold
   commit, and never touched again — this project has only ever actually used `npm run dev`/
   `npm install`) and used bun instead of npm, then correctly refused to proceed because
   `bun.lock` didn't reflect the new `razorpay` dependency. Fixed by deleting `bun.lock`
   entirely.
2. **502 on every route despite deployment status SUCCESS.** Deploy logs showed the app
   actually starting fine ("Server running on http://localhost:3000", "Starting Container") —
   not a crash. Root cause: `server.ts` hardcoded `const PORT = 3000` and never read
   `process.env.PORT`, which Railway injects and expects the app to listen on. Fixed with
   `Number(process.env.PORT) || 3000` (falls back to 3000 for local dev, where PORT is never
   set — confirmed unaffected by hand).
3. **OAuth redirect_uri came back `http://` instead of `https://`.** Found by curling
   `/auth/discord/start` on the live domain and reading the actual `Location` header before
   registering anything with Discord/LinkedIn — would have caused a redirect_uri mismatch the
   moment an `https://` URI got registered on their side. Root cause: Railway terminates TLS at
   its edge and forwards plain HTTP to the container; Express's `req.protocol` (which
   `oauth-providers.ts` builds `redirect_uri` from) only reports `https` if told to trust the
   `X-Forwarded-Proto` header. Fixed with `app.set("trust proxy", true)`.

Each of these three was a separate commit, in the order found — git log `b088191`, `f87b573`,
`cc93689`. **Lesson worth repeating: "deployment succeeded" is not the same claim as "the app
works" — the only way to know is to actually curl the live URL and read real response
codes/headers, which is what caught all three.** A fourth bug of the same class was caught the
same way slightly later — see section 6b/12's Admin-vs-client Firestore SDK finding.

### 7d. Discord/LinkedIn redirect URIs for the new domain

Added `https://lumina-web-production-b8df.up.railway.app/auth/discord/callback` and
`.../auth/linkedin/callback` as **additional** authorized redirect URIs on both providers (kept
`localhost:3000` too, for continued local dev). Discord's session had expired mid-task (needed
the user to log back in); both providers' pages were reloaded after saving and the URLs read
back to confirm persistence, not just trusting the save click.

### 7e. Gemini API key found and wired in (separate from the payment work)

User located a pre-existing `lumina-numerology` Gemini API key in Google AI Studio
(`gen-lang-client-0531769124` — matches the Firebase project exactly; confirmed via project
number `437784650725` matching `firebase-applet-config.json`'s `messagingSenderId`), created
Jun 20 2026, billed to the user's own "My Billing Account" (Tier 1 Prepay). Read the full key
via the accessibility tree of AI Studio's "API key details" dialog (not a screenshot) after
`navigator.clipboard.readText()` hung the tab waiting on a permission prompt. Saved to
`Credentials\.env`, the repo-local `.env`, and as a Railway variable. Closes the previously-open
"no GEMINI_API_KEY anywhere" gap.

---

## 8. Webhook Firestore bugs, caught by a real signed-webhook smoke test (folded into section 6/7's timeline)

Before trusting `billing.ts`'s webhook handler, built a real HMAC-signed test payload by hand
(a `payment.captured` event shape, signed with a temporary local `RAZORPAY_WEBHOOK_SECRET`) and
POSTed it to the running server — not a hypothetical review, an actual request/response cycle.
This caught two real bugs before they could ship silently broken:

1. **Client SDK `permission-denied`.** `billing.ts` originally used the same Firestore **client**
   SDK `server.ts` uses for `/api/profiles`. A Razorpay webhook has no Firebase Auth session at
   all (only an HMAC signature to trust), so Firestore Security Rules correctly denied the
   write. Fixed by switching `billing.ts` entirely to the Firebase **Admin** Firestore SDK
   (`db.collection(...).doc(...)`, not `doc()`/`getDoc()`/`setDoc()`), which bypasses Security
   Rules using the service account's own privilege — the correct trust boundary once `verifyAuth`
   or the webhook's HMAC check has already established who's allowed to do what.
2. **Wrong Firestore database, gRPC NOT_FOUND.** Even after switching to Admin SDK,
   `getFirestore(app)` with no second argument defaults to `"(default)"` — this project uses a
   **named** database (`ai-studio-luminanumerology-...`, see section 1). Fixed by reading
   `firestoreDatabaseId` from `firebase-applet-config.json` (same config the client SDK path
   already used) and passing it to `getFirestore(app, databaseId)`.

After both fixes, re-ran the same signed-payload test: `{"received":true}`, no error. Verified
the actual Firestore document via a separate one-off Admin SDK script (confirmed
`plan: "free"`, `aiCreditsRemaining: 1` — correct for a 1-credit `payment.captured` event), then
deleted the test document.

---

## 9. Category E naming fix + re-gating behind Premium (2026-09-09)

*(Numbered separately from section 6d's original finding since this is where it was actually
resolved, in a later part of the same overall project — see section 13 for the exact date.)*

Covered in full in section 13 below, since it happened as part of the same "close all open items
one by one" pass as the Razorpay/Instagram status check-in. Cross-referenced here so the
naming-issue thread (section 6d → here) is easy to follow chronologically.

---

## 10. Working conventions established across this project (for quick reference)

- **Credential reads**: always via `read_page`/`find` (accessibility tree), never by
  eyeballing/OCR-ing a screenshot. Zero misreads since adopting this after the one GitHub
  Client-ID mistake in section 3a.
- **Popups/2FA/CAPTCHAs**: `signInWithPopup`, GitHub App installation confirmation, MFA prompts,
  and hCaptcha challenges are all things browser automation cannot see or drive (or, for
  CAPTCHAs, must never attempt to solve) — every one of these needed the human, and that's
  expected, not a failure.
- **Reuse-vs-create decisions**: always check for an existing app/project first, and always
  confirm with the user before reusing one that could entangle Lumina with something unrelated
  (X's app, a stale Discord/GitHub app under a different org, etc.).
- **Verify before declaring anything done**: a green build/deploy status is not proof the app
  works — sections 7c and 8 both found real, silent bugs by actually curling the live site and
  building real signed test payloads, not by reading code or trusting dashboards.
- **Stale local dev servers**: check `netstat`/`Get-Process` before assuming new code isn't
  taking effect (section 4f) — recurred more than once.

---

## 11. Where the app's own credential-format conventions live

- Tier 1 provider secrets: exist only in Firebase Console's own UI (never touched by this app's
  own code/env at runtime).
- Tier 2 provider secrets + Firebase Admin SDK key + OAuth state secret: needed in both
  `C:\Projects\Credentials\.env` (canonical record, outside any git repo) and
  `C:\Projects\Lumina-SaaS\.env` (gitignored, repo-local — what `server.ts` actually reads via
  `dotenv.config()` at runtime).
- Railway (production) needs its own copies of the same values, set as Railway environment
  variables (not read from any `.env` file — Railway injects them directly into the container's
  `process.env`). `LUMINA_FIREBASE_ADMIN_SDK_JSON` (inline JSON content) is used in production
  instead of `LUMINA_FIREBASE_ADMIN_SDK_PATH` (a local file path that doesn't exist on Railway's
  filesystem).

Full up-to-date list of exactly which variables exist and where: section 14.

---

## 12. (Reserved — see section 8 above, which covers this project's Admin-vs-client Firestore SDK finding.)

---

## 13. Closing the open items, one by one (2026-09-09)

User asked to close the three remaining open items from section 7/handoff.md — naming issue,
Razorpay account, Instagram — one at a time, plus a final documentation pass (this rewrite).

### 13a. Category E real-numerologist naming — DONE, fully verified

Renamed all 5 AI "master" lenses from real people to original fictional archetypes, each defined
purely by the numerological method it applies:

| Real person (removed) | Archetype (now used) | Method/lens |
|---|---|---|
| Dr. J C Chaudhry | **The Grid Warden** | Chaldean & Lo Shu |
| Sanjay B Jumaani | **The Bridge Analyst** | Name Correction & Bridge Numbers |
| Dr. Kartick Chakraborty | **The Vedic Seer** | Vedic & Transit Cycles |
| Anupam V Kapil | **The Kabbalist** | Kabbalah & Esoteric |
| Rajat Nayar | **The Synthesist** | Holistic Synthesis |

Found and fixed in **every** location, not just the obvious one (a careful re-grep after the
first pass caught two more spots that would otherwise have shipped with real names still
present):
1. `server.ts`'s `/api/consult` prompt text, `systemInstruction`, and the Gemini response JSON
   schema's property names (`jcChaudhry` → `gridWarden`, etc.) and `required[]` array.
2. `index.html`'s AI-response rendering template (`masterAdviceHtml`, reads the renamed schema
   keys).
3. A **completely separate, entirely offline** code path: the `AGENTS[]` array (used by
   `runConsensus()`/the exportable report — deterministic template text, no AI call at all).
   This one was actually **worse** than the AI prompt: it hardcoded fabricated professional bios
   tied to the real names ("Guinness World Record", "Bollywood Astro-Numerologist · Celebrity
   Advisor", "Global Celebrity Numerologist · USA · UK · Dubai") that aren't even accurate
   AI-generated content — just static, invented credentials presented as fact.
4. The exportable Markdown report template (its own "Section 9: THE 5-AGENT CONSENSUS COUNCILS"
   heading and per-master bullet list).
5. A landing-page teaser card: "Synthetic synthesis from Chaudhry, Jumaani, Chakraborty, Kapil &
   Nayar algorithms." — caught by re-grepping the whole repo after the first pass, not part of
   the original plan.
6. A Tools-tab badge: `<span class="badge new">Dr. JC Chaudhry</span>` crediting him by name for
   the mobile-number numerology check (his actual, real signature technique) — also caught by
   the re-grep.

Verified: grepped the whole repo for all 5 surnames after every edit (clean each time until the
final pass came back with zero matches across `index.html` and `server.ts`); `tsc --noEmit`
clean; restarted the local dev server and curled the served HTML to confirm the 5 new archetype
names actually render server-side, not just present in source; redeployed to Railway and
re-confirmed live (`curl .../ | grep "The Grid Warden"` → found; grep for any of the 5 old
surnames → nothing).

### 13b. Category E moved back behind Premium — user's explicit choice

Asked directly rather than assumed: now that the naming risk is resolved, should Category E
(Consensus + Akashic) go back behind the paywall (original 3-package plan) or stay free as a
differentiator? **User chose: back behind Premium.**

- `index.html`: reverted the temporary free-tier CSS exclusion for `#tab-consensus`/
  `#tab-akashic` (added in section 6d, now removed) — both tabs are locked like every other
  premium feature again. `renderAkashic()`'s own separate lock (independent of the global
  `body.free-tier` mechanism) restored, now reading `serverEntitlement.plan === 'premium'`
  (server-verified) instead of the old spoofable per-profile `p.plan` field it used before the
  section 5 security fix — this is a genuine improvement over the pre-incident behavior, not
  just a revert.
- `server.ts`: both `/api/consult` and `/api/akashic` now call `spendAiCredit(uid)` (exported
  from `billing.ts` in section 6b, proven working via section 8's webhook smoke test) **before**
  running the Gemini call. A free user or a premium user who's exhausted their fair-use AI
  credits gets `402` with a clear, actionable message — and critically, the Gemini call never
  runs in that case, so this is real cost control, not just a UI-level hide.
- **Bug found and fixed along the way**: the client's `/api/consult` handler discarded the
  server's actual error message and always showed a generic "Cosmic signals interrupted. Please
  try again." toast — actively misleading for a `402`, since retrying doesn't help. Fixed to
  surface `response.json().error`. (The `/api/akashic` handler already did this correctly;
  `/api/consult` didn't, until now.)
- Verified: `tsc --noEmit` clean; restarted the dev server, confirmed both AI routes still
  correctly `401` when unauthenticated; redeployed to Railway, re-confirmed live.

### 13c. Razorpay account status — checked directly, not assumed

Logged into the Razorpay dashboard directly (not from memory/assumption) to check whether the
user's new account existed yet. Found: **still the same single account** — thekpihub.com
approved, same live key (`rzp_live_TRgvHEnUNegwWQ`), same MID `SiChGAauKLx91P`,
`razorpay.me/@thekpihub`. Checked the account/profile switcher explicitly — confirmed this is a
single-business login, not a multi-account one with a second Lumina account hiding behind a
switcher. **No new account exists.**

User was confused about whether this meant "add Lumina to the existing account" — clarified:
no, it needs to be a genuinely fresh signup at razorpay.com (not logged into the existing
account), with new business details for Lumina, because Razorpay's own UI already confirmed
(section 7a) that adding a different-business-model site to the existing account isn't valid.
**User said they'd do this next** — this remains the single biggest blocker to the payment
system being real rather than architecturally-ready-but-inactive.

### 13d. Instagram — re-confirmed still blocked, asked directly

Asked the user directly (not assumed from section 4's earlier note) whether they now have a
Business/Creator Instagram account linked to a Facebook Page. **User confirmed: no, not yet.**
Nothing to build until that exists — the plan for exactly what to build once it does is already
fully written out in `handoff.md`'s "If continuing with Instagram" section, so no work was lost
by deferring again.

### 13e. This document rewrite

User asked for "every single step taken till now" to be captured across all relevant `.md`
files and the global skill, since this file's section numbering had become tangled through
incremental edits (0, 1, 2, ..., 7, 9, 11, 12, 10 — non-chronological, hard to follow) and was
missing the section-13 events entirely. This is that rewrite: same content as before
(nothing removed), renumbered into a single chronological sequence, with the missing sections
(9, 13, this section, and an updated credential index) added. `handoff.md` and the global skill
`lumina-saas` were updated in the same pass — see those files for the current-state summary this
detailed log supports.

---

## 14. Where every credential lives (kept current — update this whenever a credential changes)

All in `C:\Projects\Credentials\.env`, under a `# LUMINA-SAAS — ...` comment block per provider.
**This `.env` file is outside any git repo** — the standing convention for this whole
`C:\Projects` working environment is to never paste raw secret values into chat, commits, or any
file tracked by git, including this one. Variable names only, listed below — never values.

| Credential | Env var name(s) | Where it's actually consumed at runtime |
|---|---|---|
| GitHub OAuth (Tier 1) | `LUMINA_GITHUB_CLIENT_ID`/`_SECRET` | Firebase Console only |
| X/Twitter OAuth 1.0a (Tier 1) | `LUMINA_X_CONSUMER_KEY`/`_SECRET` (+ an unused OAuth2 pair, `LUMINA_X_OAUTH2_CLIENT_ID`/`_SECRET`) | Firebase Console only |
| Facebook OAuth (Tier 1) | `LUMINA_FB_APP_ID`, `LUMINA_FB_CLIENT_TOKEN`, `LUMINA_FB_APP_SECRET` | Firebase Console only |
| Microsoft/Entra OAuth (Tier 1) | `LUMINA_MS_TENANT_ID`, `LUMINA_MS_CLIENT_ID`, `LUMINA_MS_CLIENT_SECRET` | Firebase Console only |
| Yahoo OAuth (Tier 1) | `LUMINA_YAHOO_APP_ID`, `LUMINA_YAHOO_CLIENT_ID`/`_SECRET` | Firebase Console only |
| Discord OAuth (Tier 2) | `LUMINA_DISCORD_CLIENT_ID`/`_SECRET` | `Lumina-SaaS\.env` (local) + Railway variable |
| LinkedIn OAuth (Tier 2) | `LUMINA_LINKEDIN_CLIENT_ID`/`_SECRET` | `Lumina-SaaS\.env` (local) + Railway variable |
| Firebase Admin SDK service account | `LUMINA_FIREBASE_ADMIN_SDK_PATH` (local file path) *or* `LUMINA_FIREBASE_ADMIN_SDK_JSON` (inline content, Railway) | Both `.env` files locally (path); Railway variable (inline JSON) |
| OAuth CSRF state signing secret | `OAUTH_STATE_SECRET` | `Lumina-SaaS\.env` (local) + Railway variable |
| Gemini API key | `GEMINI_API_KEY` | `Lumina-SaaS\.env` (local) + Railway variable |
| Razorpay (not yet real) | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Not set anywhere yet — pending the user's new account (section 13c) |
| MindStudio (shared across ~10 of the user's projects, not Lumina-specific) | `MINDSTUDIO_API_KEY_LOCAL`/`MINDSTUDIO_MCP_URL` (given for this project 2026-09-09, identical to the value already on file from the Ashverse project) | Not consumed by any Lumina code — see section 15f |

The actual key file this table's Firebase Admin SDK row refers to:
`C:\Projects\Credentials\lumina-firebase-adminsdk.json` (never inside the repo).

---

## 15. "Deploy it live, minimum real cost, use everything I've given you" — the full domain saga (2026-09-09, continued)

Same day as section 13, later in the session. User's ask, paraphrased from several messages: get the app fully deployed and live at `https://lumina.bhasad.org`, using Claude-in-Chrome plus whatever tokens/links/subscriptions get shared, keep real money spent to a bare minimum, and stop asking for permission except when genuinely stuck after multiple real attempts. What follows is everything that came out of chasing that down — most of it about `bhasad.org` turning out not to exist as a real, ownable thing, which is worth reading in full since it explains several loose ends elsewhere in this file.

### 15a. `bhasad.org` — exhaustively checked, conclusively not available

Checked, in order, across an entire sub-session:

1. **The live domain itself**, fetched directly (twice, at different points, always the same result): a live, unrelated third-party site — a Samsung-impersonation storefront pushing an online gambling platform ("Slot SeaBank" / "IDEBET SI PENDOO", copyright 2026). Nothing to do with Lumina or the user.
2. **A pre-existing fake feature already in the app's own code, found while investigating.** `index.html` (a "Custom Domain Gateway" modal — hardcoded "● LIVE & CONNECTED", fabricated CNAME/A/TXT records) and `server.ts`'s `GET /api/domain-check` (returns `dnsVerified: true` and a fabricated records array unconditionally, no real DNS lookup at all) both already claimed `bhasad.org` was live and connected. `git log -S bhasad` traced this to commit `3975011`, dated **2026-07-31** — weeks before this project's Claude Code sessions started — meaning it was fabricated by an earlier **Google AI Studio Gemini coding-agent session**, not by me. Same "confidently fake infrastructure" pattern as this project's other known incidents (the fake payment flow, the fake numerologist bios).
3. **Google Workspace admin console** (`admin.google.com`) — structurally blocked for browser automation entirely: both page-content reads and screenshots fail outright on every URL tried there (a deliberate restriction for admin/security consoles, not a fixable UI quirk). Asked the user to check it directly instead; they didn't get back to that specific ask before offering other explanations.
4. **Squarespace account** (the user's stated "I own bhasad.org" backing, first attempt) — `account.squarespace.com/domains` explicitly said "There are no domains." The one thing that *did* exist there: a trial **website** literally titled "Bhasad.org" living at a Squarespace-assigned placeholder address (`lanternfish-alligator-ha2k.squarespace.com`), trial expiring **2026-09-23** — almost certainly the actual source of the AI Studio agent's false "pre-owned domain" assumption in point 2. Squarespace is also the registrar behind Google's own domain-purchase products (both Cloud Domains and Workspace domain purchases route through Squarespace under the hood, confirmed via Cloud Domains' own on-screen terms-of-service notice) — so this same empty result covers the Workspace path too.
5. **Google Cloud's own domain registrar** (Cloud Domains), checked individually across **every one of the user's 5 GCP projects** under billing account `019296-3A1EF7-4C9ED0` — `lumina-numerology` (`gen-lang-client-0531769124`), `kpihub-live`, `bhasad-ytchannel`, `My First Project` (`project-e8224ebb-3069-4ef6-81c`), and `Default Gemini Project` (`gen-lang-client-0459193981`). Every single one: "Cloud Domains API is not enabled" / "No rows to display."
6. A guessed alternative, `luminanumerology.com` — already live and taken too, by a completely unrelated numerology product (different design, testimonials, branding). Domain names in this niche are clearly getting sniped quickly; stopped guessing further rather than waste time chasing more false leads.
7. User's final explanation: **"i purchased it from google workspace."** Live-rechecked the domain itself immediately after this claim — unchanged, still the same gambling content. This is consistent with a transfer-in-progress (if bought from the existing squatter/broker) taking real time to complete, or with a genuine mix-up.

**Net conclusion, stated plainly to the user:** `bhasad.org` is not registered under any account they have access to, checked six independent ways. One likely explanation for the whole mix-up: the user has a real, separate GCP project named **`Bhasad-YTChannel`** (a YouTube-channel venture, unrelated to Lumina) and the MindStudio workspace's own "Developer" field for Lumina's agents (section 15f) is registered as **"Bhasad Group Of Companies"** (the same LinkedIn Company Page created for LinkedIn OAuth in section 4c) — "Bhasad" is a genuine, legitimate brand name of the user's, just not one with `.org` actually secured.

**Resolution, since a real domain purchase is a financial decision I won't make unilaterally regardless of blanket pre-authorization:** the live Railway URL stands as the production deployment. Offered to register + connect a real, available domain the moment the user names one and confirms; not pursued further this session.

### 15b. The `WebFetch` tool hit its monthly spend cap mid-investigation

Partway through re-verifying `bhasad.org` live, the `WebFetch` tool started returning "You've hit your monthly spend limit" (resets 7:30am Asia/Kolkata). Every verification after that point in the session used Claude-in-Chrome browser navigation instead (`get_page_text`/screenshots) — slower and occasionally flaky (see 15c), but it kept the investigation fully verifiable without relying on a tool that was no longer available.

### 15c. Browser-automation flakiness worth knowing about for next time

Several tabs this session (the AI Studio app editor especially, and briefly a MindStudio agent editor) went genuinely unresponsive — `computer` screenshot calls timing out with "Script injection timed out" or a hard 30-second CDP timeout, sometimes for several retries in a row. In every case, the fix was the same: stop retrying screenshots on the frozen tab, use `get_page_text` instead (usually still worked even when screenshots didn't), and if that also failed, close the tab and re-navigate fresh rather than fighting a stuck renderer. One genuinely alarming moment: a large multi-line `type` action into a MindStudio prompt editor returned a tool-call error ("Failed to type: ... timed out"), and the tab froze completely for the following ~15 seconds of retries — but reopening the page afterward showed the edit had actually gone through correctly and cleanly (no corruption, no duplication). Lesson: a timeout on the response side doesn't necessarily mean the action itself failed — verify the actual resulting state before assuming an edit needs to be redone.

### 15d. Confirmed the Railway deployment is genuinely solid, end to end

Direct, live verification (not just re-reading old status): `GET /` → `200`, page HTML contains "Grid Warden" (proves today's latest code, including the Sep 8 archetype renaming, is what's actually being served — not a stale build); `GET /api/billing/entitlement` with no auth → `401` (proves the auth gate is real, not decorative). Cross-checked against Railway's own deployment history via its MCP tools: the most recent deploy (`ebc467e9`, triggered by the memory.md/handoff.md doc-only commit `bc18657`) built and went live in about a minute, fully automatically — confirming the local → GitHub → Railway pipeline needs no manual intervention at all, for either code or docs-only commits.

### 15e. Google Cloud billing account audit (from 4 screenshots the user shared directly)

User shared 4 screenshots of their own GCP console covering: Cloud Hub for `thekpihub` (org `nitro0dust-org`, ₹18.31 total cost, -64.1% cost change over 7 days — trivially small); the `lumina-numerology` project's own console (confirms display name matches `gen-lang-client-0531769124` exactly, as already on file); and, most usefully, **the shared billing account's Cost breakdown and Credits pages** — billing account `019296-3A1EF7-4C9ED0`, August 2026 total ₹1,084.08 across "All projects (5)", and **4 active "Google Developer Program premium benefit" monthly credits** (3 at 100% remaining, 1 at 53%) plus 2 expired Free Trials. This is what led to enumerating all 5 linked projects by name (section 15a point 5) via the billing account's own "Account management" → "Projects linked to this billing account" screen, which is also the cleanest way to get a definitive full project list when Cloud Resource Manager's default view is scoped to only one organization at a time.

### 15f. Found and fixed a real, live instance of the numerologist-naming issue — in MindStudio, not the main app

While investigating a MindStudio MCP URL + Bearer token the user shared (already on file from an earlier Ashverse-project session under the same value — nothing new to save), queried the MCP endpoint directly (`tools/list` over the MCP streamable-HTTP transport) — authenticated fine, returned zero tools. Checking why led to MindStudio's own dashboard (`app.mindstudio.ai`), which turned out to hold a whole pre-existing workspace of ~14 agents spanning most of the user's other projects (KPI Hub, Interview Lab, AI-ForgeStream) as a shared AI-agent utility layer, built in sessions this project's memory has no record of. Two are Lumina-specific:

- **"Lumina Cosmic Council Guidance"** — described as "Reimplements Lumina's real, live `/api/consult` endpoint: the 5 Masters synthesis..." Opened it and found its prompt (published **2026-08-13**, i.e. weeks before the Sep 8 archetype-renaming fix in the main app) still hardcoded all 5 real numerologists' names verbatim — the exact same legal/reputational issue fixed in `server.ts`/`index.html`, just sitting unfixed in a completely separate system. **Fixed directly**: edited the prompt to the same 5 archetype names (Grid Warden, Bridge Analyst, Vedic Seer, Kabbalist, Synthesist) used everywhere else, and published it (now **Version #2**, 2026-09-09). Confirmed via the agent's own "Developer" field that this workspace is registered under **"Bhasad Group Of Companies"** — the same LinkedIn Company Page from section 4c, further confirming "Bhasad" is a real, legitimate brand of the user's, unconnected to the squatted `.org` domain.
- **"Lumina Report Translator"** — checked too; it's a generic language pass-through (takes an already-generated report + target language, translates while preserving structure/numbers) with no hardcoded names of its own. Nothing to fix.

Also confirmed via the Service Router usage dashboard: every recent run across the whole MindStudio workspace is failing with `insufficient_credits/balance` — the account itself has no funds. This isn't something to fix by spending money on it: Lumina's real `/api/consult` already runs on a real, working Gemini API key with no dependency on this MindStudio workspace at all (confirmed via `grep -ri mindstudio` across the whole repo: zero matches — these MindStudio agents are dormant duplicates, not wired into the live app).

**Also clarified for the user, since it came up directly:** "integrating Claude Pro / ChatGPT Pro / Gemini Pro subscriptions" into MindStudio isn't something that exists — those are consumer chat subscriptions with no public API for third-party automation, categorically different from the pay-per-token Anthropic/OpenAI API keys that would actually be needed for that kind of integration. Nothing was built here; the real, working AI integration remains the Gemini API key already wired into `server.ts`.

### 15g. Repo made public + real branch protection applied

User asked to set up branch protection on `main`. Checked directly (`gh api .../branches/main/protection` and `.../rulesets`, both) — GitHub's Free plan provides **zero** branch-protection features for private repos (both endpoints return the same 403: "Upgrade to GitHub Pro or make this repository public"), confirmed via the API itself, not assumed. Presented the real choice to the user (pay for GitHub Pro vs. make the repo public vs. skip it) — **user chose to make it public.**

Before doing that (an action with real, hard-to-fully-reverse exposure once anyone has cloned it): scanned the **entire git history**, not just the current tree, for anything secret-shaped (`AIzaSy...` keys, `sk-...` keys, private-key headers, `client_secret`/`password` assignments, Razorpay live keys) via `git log --all -p | grep`. Found only: a Firebase Web `apiKey` (public-by-design — it's shipped to every visitor's browser already, in the deployed site's own JS, and grants no access by itself; Firebase's actual access control is Security Rules, not this key), a Razorpay `Key ID` (also meant to be public, same role as a Stripe publishable key), and markdown documentation mentioning env-var *names* like `LUMINA_MS_CLIENT_SECRET` (never actual values). Separately confirmed via `git log --diff-filter=A --name-only` that no `.env` file or the Firebase Admin SDK JSON was **ever** committed at any point in history — only `.env.example` (a placeholder-only template, from the original 2026-07-25 AI Studio scaffold commit). Concluded genuinely safe, then:

1. `gh repo edit ... --visibility public --accept-visibility-change-consequences` — repo is now public (verified: `{"private": false, "visibility": "public"}`).
2. `gh api -X PUT .../branches/main/protection` with `allow_force_pushes: false`, `allow_deletions: false`, no required PR reviews/status checks (deliberately — the user is the sole committer, and requiring reviews would just add friction to the exact same direct-push workflow used throughout this whole project). Verified via the same endpoint's response.

### 15h. Still genuinely unresolved

The user referenced "the below listed links" three separate times across this session (asking to use Claude-in-Chrome to go through them) — no links ever actually attached to any of those messages. Flagged each time; not chased further since there's nothing to act on without them.

Razorpay (real account) and Instagram OAuth remain exactly as described in section 13 and `handoff.md` — neither was touched this pass.

---

## 16. Yahoo (Tier 1) wired up + a real production-only bug found and fixed (2026-09-10)

New session (context cleared, re-loaded via the `lumina-saas` skill + this file). Priority order
from `handoff.md` was Razorpay → Instagram → Yahoo; both Razorpay and Instagram are still
user-side-blocked (re-confirmed nothing had changed since 2026-09-09), so proceeded with Yahoo,
the one actually unblocked item, with the user's explicit go-ahead.

**Code**: added a `providerName === 'yahoo'` branch in `index.html`'s `triggerFederatedLogin`,
copied from the Microsoft branch exactly — `new firebase.auth.OAuthProvider('yahoo.com')` via
`signInWithPopup`. The button already existed (`btn-yahoo` / `triggerFederatedLogin('yahoo')`)
from the original fake-provider scaffold, so no HTML changes needed.

**Yahoo Developer app**: created "Lumina Numerology (Dev)" at developer.yahoo.com/apps under
`re.design949@gmail.com` (user logged in themselves — Claude never touches Yahoo credentials).
App ID `mZbst5hW`, Confidential Client, OpenID Connect Permissions (Email + Profile) checked.
Redirect URI registered: `https://gen-lang-client-0531769124.firebaseapp.com/__/auth/handler`
(Firebase's own hosted auth handler — standard Tier 1 pattern, no repo-local `.env` entry
needed). Hit Yahoo's brand-name filter ("'Yahoo' is not allowed to be used" in the Description
field) — reworded around it, unrelated to anything functional.

Client ID/Secret pulled via `read_page` (accessibility tree), not screenshot OCR, then saved
straight to `C:\Projects\Credentials\.env` under `LUMINA_YAHOO_APP_ID`/`_CLIENT_ID`/`_SECRET` —
never echoed into chat.

**Firebase Console**: enabled Yahoo as a sign-in provider, pasted in the real Client ID/Secret.
Hit the known "Save stays disabled after automated paste" React quirk on the Client Secret field
specifically (error persisted even with the field visibly full) — fixed by clicking elsewhere to
blur the field rather than the previously-documented retype-from-empty trick; both work, blur is
faster.

**Deployed and verified live** (not just a green Railway status): committed, pushed, watched the
Railway deployment go `BUILDING` → `SUCCESS` via the Railway MCP tools
(`list-deployments`/`get-logs`, project `f1cea083-aaf5-4ee9-90c5-47f7f64d8995`), then `curl`ed the
live URL and grepped for `yahoo.com` in the served HTML to confirm the actual new code was there,
not just a successful build.

**First live click-through failed**: `auth/unauthorized-domain`. Root cause, found by checking
Firebase Console → Authentication → Settings → Authorized domains directly: **the Railway
production domain (`lumina-web-production-b8df.up.railway.app`) was never in that list** — only
`localhost`, the two Firebase-default domains, and several `*.run.app`/`ai.studio` domains
related to the AI Studio scaffold were present. This means **every Tier 1 popup provider
(Google, GitHub, X, Facebook, Microsoft — not just Yahoo) would have hit this same wall on the
live production site**, despite all being "user-confirmed working" in section 3 — that
confirmation was necessarily on `localhost` only, since the domain was never authorized in
production until now. Added the Railway domain via "Add domain" in that same settings page;
confirmed via the "domain added" toast. Re-tested Yahoo — no more console error, real popup
opened. **User confirmed working** after logging through the real popup themselves.

**Flagged, not yet done**: re-test Google/GitHub/X/Facebook/Microsoft on the *live* Railway URL
specifically, now that the domain gate is fixed — they were likely silently broken on production
this whole time and nobody would have noticed since all prior manual confirmation happened on
`localhost`. Not chased further this session; next session should check with the user whether
this was done, or do it.

**Updated `handoff.md`'s open-items list**: Yahoo moved from "still open" to done; Razorpay and
Instagram remain exactly as before, now first and second (previously first and second of three,
Yahoo removed).

### 16a. Re-tested Google/GitHub/X/Facebook/Microsoft on production (same session, right after)

User asked to go re-test the other 5 Tier 1 providers on the live site, per the flag above.
Triggered each one from https://lumina-web-production-b8df.up.railway.app's real sign-in modal
(fresh page load before each, to avoid stale-modal-state false negatives — hit exactly this on
the first X/Twitter attempt, where a failed `navigate` left the click landing on the previous
provider's leftover "Connecting..." state; redone cleanly after). Checked
`read_console_messages` after each click. **Zero errors on any of the 5** — no
`auth/unauthorized-domain`, no other Firebase error. Each opened a real `signInWithPopup` window
outside Claude-in-Chrome's tracked tab group, so full login completion wasn't driven here (same
structural limitation as every prior provider test) — only the config-level failure mode was
being checked for, and it's clear across the board. Confirms the fix in section 16 wasn't
Yahoo-specific.

One transient hiccup: a `navigate` call returned "Browser extension is not connected" once,
right after the Facebook click — recovered on its own by the next `tabs_context_mcp` call.
Likely the OS-level popup window briefly stealing focus from Chrome; not a real problem, just
retried the navigate.
