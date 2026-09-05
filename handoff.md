# Lumina-SaaS — handoff / next steps

Written at the end of a session that wired 4 (possibly 5) of the app's 9 login providers to
real OAuth. Read `memory.md` in this same folder first for the full detailed log — this file is
just the "what to actually do next" checklist. Also see the global skill `lumina-saas`
(invoke it, or read `C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md` directly) for a
same-session-equivalent digest you can load from any working directory.

## Immediate next step: confirm Microsoft actually works

This was the very last thing done before this handoff was written, and it was **not yet
confirmed** by live test.

1. Make sure the dev server is running: `cd C:\Projects\Lumina-SaaS && npm run dev` (serves on
   `http://localhost:3000`).
2. Open the app in a normal browser tab (not through browser automation — Firebase's
   `signInWithPopup` opens a real separate window that automation tools can't see or drive).
3. Click **"SIGN IN / REGISTER"** → **Microsoft Active**.
4. Complete the Microsoft popup (sign in with any Microsoft account — personal or work/school,
   both are allowed per the app's account-type setting).
5. Confirm you land back in the app **actually signed in** (header shows your name + email and
   a "Sign Out" button, not still "SIGN IN / REGISTER").

**If it fails**, the most likely causes, in order of likelihood:
- A typo in the Application (client) ID or secret copied into Firebase — re-check both against
  `LUMINA_MS_CLIENT_ID` / `LUMINA_MS_CLIENT_SECRET` in `C:\Projects\Credentials\.env`, and
  against the values on the Entra app's Overview / Certificates & secrets pages
  (portal.azure.com → App registrations → "Lumina Numerology Dev").
- The client secret already expired or was deleted — check its expiry (was set to 4/3/2027 at
  creation, so unlikely soon) and that it still appears under Certificates & secrets.
- `auth/unauthorized-domain` from Firebase, same class of issue Google originally had — check
  Firebase Console → Authentication → Settings → Authorized domains still includes `localhost`.

## If Microsoft is confirmed working: this session's original scope is done

The user's "Tier 1" scope (providers Firebase supports natively, no custom backend) is now
fully real: **Google, GitHub, X/Twitter, Facebook, Microsoft**. Nothing further is required
unless the user wants to keep going. Options if they do:

### Option A — Wire up Yahoo (also Tier 1, never actually reached)

Same overall pattern as the other four:
1. Check whether a Yahoo Developer app already exists for this account at
   developer.yahoo.com/apps — if the browser isn't logged into Yahoo, the user will need to sign
   in themselves (same as every other provider this session — I can't enter their password).
2. Create a new app if none exists. Yahoo's OAuth setup wants a Redirect URI —
   set it to `https://gen-lang-client-0531769124.firebaseapp.com/__/auth/handler` (same Firebase
   handler URL used for every other provider).
3. Get Yahoo's Client ID + Client Secret, save to `.env` as `LUMINA_YAHOO_CLIENT_ID` /
   `LUMINA_YAHOO_CLIENT_SECRET` (matching the naming convention already used for the other 4:
   `LUMINA_<PROVIDER>_...`).
4. Firebase Console → Authentication → Sign-in method → Add new provider → Yahoo → paste
   Client ID + Client Secret → Enable → Save. Watch for the same "Save button stays disabled
   after typing" quirk hit repeatedly this session — fix by clicking into a different field and
   back to force React to re-validate, or by clearing the field completely (triple-click →
   Delete) and retyping fresh rather than typing over existing text.
5. In `index.html`, find the `triggerFederatedLogin` function (search for
   `providerName === 'facebook'` or `'microsoft'` to locate the right spot) and add a new
   `else if (providerName === 'yahoo')` branch, copy-pasting the Microsoft or Facebook branch as
   a template and swapping in `new firebase.auth.OAuthProvider('yahoo.com')`.
6. Reload (`ctrl+shift+r`) and ask the user to test the popup manually — same as every other
   provider, browser automation cannot drive or observe the popup window itself.

### Option B — Tackle Tier 2 (LinkedIn, Instagram, Discord)

These are **not** natively supported by Firebase Auth, so this is meaningfully more work:
LinkedIn, Instagram, and Discord all need a custom backend doing the OAuth
authorization-code exchange and then minting a Firebase custom token via the **Admin SDK**,
which requires a **service-account key** (a new, more sensitive credential to manage — treat it
like the other secrets, `C:\Projects\Credentials\.env` only, never committed).

The Express server already running in `server.ts` is the natural place to add these endpoints
(e.g. `/auth/linkedin/callback`), since it's already part of this app's dev/build pipeline.
General shape of what each one needs, once the user opts into this scope:
1. Register an OAuth app on that provider's own developer console (LinkedIn Developer Portal /
   Meta for Developers → add "Instagram Basic Display" or similar / Discord Developer Portal).
2. Get that provider's own Client ID + Secret; redirect URI points at **your own server
   endpoint** this time, not Firebase's handler (e.g.
   `http://localhost:3000/auth/linkedin/callback`), since the code exchange happens server-side.
3. Server endpoint: receive the provider's authorization code, exchange it server-side for that
   provider's access token + profile info, then call Firebase Admin SDK's
   `auth.createCustomToken(uid, claims)` and return that token to the client.
4. Client-side: instead of `signInWithPopup`, call `signInWithCustomToken(customToken)` once the
   server hands back the custom token.
5. Set up a Firebase Admin service account: Firebase Console → Project Settings → Service
   Accounts → Generate new private key → save the JSON somewhere under
   `C:\Projects\Credentials\` (never inside the repo), reference its path via an env var the
   server reads at startup.

This is a bigger, separate piece of work — confirm with the user before starting rather than
assuming they still want it 2+ hours later.

## Housekeeping worth doing regardless

- **Delete/replace the remaining `[object Object]` bug**: even though LinkedIn/Instagram/Yahoo/
  Discord are staying fake for now, the visible `user.[object Object]@lumina.net` placeholder
  text in their mock login forms is a cosmetic bug independent of the OAuth work — worth a
  one-line fix if the user ever wants these demo screens to look clean (search `index.html` for
  `inline-mock-email` to find it).
- **Consider committing the `index.html` changes** — as of this session's end, the real-OAuth
  code changes exist only in the local working tree (`C:\Projects\Lumina-SaaS`); check
  `git status` and `git diff` next session, and ask the user whether/how they want this
  committed and pushed to `hsharmagxi-debug/Lumina-SaaS`.
- **`memory.md` and this `handoff.md` are inside the repo** — if the user commits the OAuth
  wiring changes, decide together whether these two docs should be committed too or left
  untracked/gitignored (they contain no secrets, just narrative, so committing them is safe from
  a security standpoint — purely a judgment call on repo hygiene).
