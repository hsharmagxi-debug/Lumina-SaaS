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

## 8. Where every credential lives

All in `C:\Projects\Credentials\.env`, under a `# LUMINA-SAAS — ...` comment block per provider,
appended in this order: GitHub → X (OAuth2 pair, then the real OAuth 1.0a pair) → Facebook →
Microsoft. Variable names only, listed above per section. **This `.env` file is outside any git
repo** — the standing convention for this whole `C:\Projects` working environment (see
`C:\Projects\CLAUDE.md`) is to never paste raw secret values into chat, commits, or any file
tracked by git — including this one.
