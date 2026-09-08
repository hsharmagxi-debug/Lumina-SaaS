# Lumina-SaaS — handoff / next steps

Read `memory.md` in this same folder first for the full detailed log — this file is just the
"what to actually do next" checklist. Also see the global skill `lumina-saas`
(`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-equivalent digest
loadable from any working directory.

## 📋 Premium pricing & Razorpay plan — drafted, awaiting sign-off

Full plan published as an artifact: **"Lumina Premium Blueprint"**
(https://claude.ai/code/artifact/d53e2240-2e54-46b6-a4cd-e689a0140434) — pricing (₹299/mo,
₹2,499/yr, ₹49 AI-credit top-ups), the 5 premium categories mapped to real existing tabs, honest
competitive positioning (checked: multi-system AI synthesis is NOT unique to Lumina — jenova.ai
already does it; the defensible claim is the specific 5-system + forecast + correction-tools
bundle, not an unverifiable "world first"), and the full engineering build order (Firebase
ID-token middleware → Razorpay Subscriptions/Orders → webhook → `entitlements/{uid}` Firestore
collection → real gates on every premium check and both AI routes). Read it before starting any
of the Razorpay work — it's the source of truth for phase order, not this file.

**One new finding from that research, separate from payments, also needs a decision:**
`server.ts`'s `/api/consult` prompt (the "Master Consensus Engine") generates AI readings
explicitly in the voice of 5 named real people — Dr. J C Chaudhry, Sanjay B. Jumaani, Dr.
Kartick Chakraborty, Anupam V. Kapil, Rajat Nayar. Checked: at least the first two are real,
currently active, prominent professional numerologists in India with their own paid
consultancies (jcchaudhry.com / Chaudhry Nummero Pvt. Ltd.), with nothing in this codebase
suggesting their knowledge or consent. This is a real legal/reputational exposure (false
endorsement) independent of the payment work, and should be resolved — likely by renaming the
5 lenses to original archetypes describing the *method* rather than the person — before this
feature (Category E in the plan) goes anywhere near a paywall. See the plan's §0 for the full
writeup and the two honest paths forward.

## ⚠️ CRITICAL, STILL OPEN: no real payment gateway — premium is a stopgap, not a fix

User-reported (2026-09-08): anyone could grant themselves Premium with a single click, for
free. Confirmed and it was worse than reported — see memory.md's "CRITICAL: fake premium tier /
no payment gateway" section for the full writeup. **What's done today is a stopgap that closes
the self-service hole, not the real fix**:
- Client-side self-upgrade disabled (`togglePlan()` in `index.html` now only allows paid→free,
  never free→paid); new-profile plan dropdowns default to Free with Premium marked
  "Coming Soon"; existing self-granted "paid" profiles reset to free via a schema migration
  (`SCHEMA_VERSION` bumped to 6); the fake `simulatedSurchargePayment()` no longer grants
  anything.
- Server-side defense in depth: `POST /api/profiles` in `server.ts` now forces `plan: "free"`
  on every profile regardless of what the client sends.
- **Still genuinely broken, not touched**: `/api/profiles` has **no authentication at all** —
  it trusts whatever `email` the caller claims, so anyone can read or overwrite anyone else's
  saved profiles by knowing/guessing their email. This needs real Firebase ID-token
  verification middleware before this app has any real users.
- **The actual ask (real Razorpay-backed subscriptions) is not built yet.** User chose Razorpay
  as the gateway. This needs: a Razorpay account/API keys for this project, a checkout flow
  (Monthly $11 / Yearly $111 as currently advertised in the UI, plus the ₹1,100 one-off Akashic
  slot purchase), a webhook endpoint verifying payment signatures server-side, and entitlement
  storage tied to the authenticated Firebase UID (not email, not client-supplied) that every
  premium-gated feature checks. This is a substantial follow-up project of its own — plan it
  properly (likely its own EnterPlanMode session) rather than bolting it on quickly.

## Current state (2026-09-08)

**Tier 1 (Firebase-native providers) — fully done, all 5 user-confirmed working**: Google,
GitHub, X/Twitter, Facebook, Microsoft.

**Tier 2 (custom backend + Firebase Admin SDK) — Discord AND LinkedIn done and user-confirmed
working.** Only Instagram remains unwired — see below.

The Tier 2 architecture (new this session) is generic: `oauth-providers.ts`'s `PROVIDERS` table
+ `createOAuthRouter()` in `server.ts` + `startOAuthPopup()` in `index.html`. Adding a new
provider is: one more `PROVIDERS` entry (authorize URL, scope, token exchange, profile fetch)
and one more `else if (providerName === '...')` branch calling `startOAuthPopup(...)`. No
architecture changes needed.

## Immediate next step: decide whether to commit

As of this session's end, the Tier 2 code changes (`oauth-providers.ts`, `server.ts`,
`index.html`, `package.json`/`package-lock.json` for the new `firebase-admin` dependency) exist
only in the local working tree — not yet committed. `git status --short` to confirm, then commit
if you want this checkpointed (matches how Tier 1's changes were eventually committed as
`baaa64e`).

**Two files intentionally are NOT tracked and must stay that way**: `.env` (repo root — holds
`LUMINA_DISCORD_CLIENT_ID/SECRET`, `LUMINA_FIREBASE_ADMIN_SDK_PATH`, `OAUTH_STATE_SECRET`) and
`C:\Projects\Credentials\lumina-firebase-adminsdk.json` (the Firebase Admin service-account key,
lives outside the repo entirely). Both confirmed gitignored / out-of-repo already.

## LinkedIn — done (2026-09-08, same day as Discord, continued session)

Picked back up after the user logged into developer.linkedin.com themselves. Full detail in
memory.md's "LinkedIn — done, user-confirmed working" section — short version: created a
LinkedIn Company Page ("Bhasad Group of Companies", required — personal profiles can't own a
dev app), app `Lumina-Numerology-Dev` (ID `264524009`), added the "Sign In with LinkedIn using
OpenID Connect" product, redirect `http://localhost:3000/auth/linkedin/callback`. Credentials
in both `.env` files. **User-confirmed working live.** No further action needed here.

## If continuing with Instagram

Deferred because "Instagram API with Facebook Login" (the modern, non-retired product) only
authorizes Instagram **Business or Creator** accounts linked to a Facebook Page the signing-in
user admins — not personal/private Instagram accounts. Before starting any code work here,
confirm with the user that they now have that set up (or are willing to convert their account
and link a Page — a real, user-side action, not something I can do). If yes, the flow is more
involved than LinkedIn/Discord:
1. Facebook Login OAuth dialog (same `https://www.facebook.com/.../dialog/oauth` family used
   conceptually by Tier 1's Facebook provider, but this is a separate app-level product config —
   likely a `config_id`-based "Facebook Login for Business" setup in the Meta app dashboard,
   not raw scopes).
2. Token exchange at `https://graph.facebook.com/.../oauth/access_token`.
3. Profile fetch is two hops: `GET /me/accounts` (list Pages the user admins) → each Page's
   `instagram_business_account` field → `GET /{ig-user-id}?fields=id,username,profile_picture_url`
   using the Page access token, not the user token.
4. **Instagram's Graph API never exposes email** — `profile.email` will always be null for this
   provider; `submitInlineAuth`'s email argument will need a synthesized placeholder or `null`,
   worth flagging to the user rather than quietly fabricating an address.
5. This would be a new `instagram` entry in `oauth-providers.ts`'s `PROVIDERS` table — the
   `fetchProfile` function is the main deviation from the LinkedIn/Discord pattern (two API
   calls instead of one, plus needing the Page access token rather than the user token for the
   second call).

## Housekeeping still open from the Tier 1 session (unchanged, still true)

- The `[object Object]` cosmetic bug in the remaining fake login mocks (Yahoo, and Instagram
  until it's wired) — search `index.html` for `inline-mock-email`.
- Yahoo (Tier 1, Firebase-native) was never reached across either session. Same pattern as
  Microsoft/Facebook: create a Yahoo Developer app, enable the Yahoo provider in Firebase
  Console with its Client ID/Secret, add a `providerName === 'yahoo'` branch using
  `signInWithPopup(new firebase.auth.OAuthProvider('yahoo.com'))` — this one does NOT go through
  the Tier 2 popup/backend flow since Yahoo *is* natively supported by Firebase Auth.
