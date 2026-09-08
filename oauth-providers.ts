// Generic OAuth "authorization code" flow for providers Firebase Auth doesn't support natively
// (LinkedIn, Discord, ...). Each provider entry describes how to build its authorize URL,
// exchange a code for an access token, and fetch a normalized profile. The router mounted at
// `/auth` handles `/:provider/start` (redirect to the provider) and `/:provider/callback`
// (code exchange -> Firebase Admin custom token -> postMessage back to the opener window).
//
// See index.html's `startOAuthPopup()` for the client side of this flow, and memory.md/
// handoff.md for the full write-up of why this exists (Tier 2 providers).

import crypto from "crypto";
import express from "express";
import type { Auth as AdminAuth } from "firebase-admin/auth";

export interface OAuthProfile {
  uid: string;
  name: string;
  email?: string;
  avatar?: string;
}

interface ProviderConfig {
  authorizeUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthorizeParams?: Record<string, string>;
  exchangeCode: (params: {
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  }) => Promise<string>;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

async function postForm(url: string, form: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (!data.access_token && !data.id_token)) {
    throw new Error(data.error_description || data.error || `Token exchange failed (HTTP ${res.status})`);
  }
  return data;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  linkedin: {
    // "Sign In with LinkedIn using OpenID Connect" product.
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scope: "openid profile email",
    clientIdEnv: "LUMINA_LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LUMINA_LINKEDIN_CLIENT_SECRET",
    exchangeCode: async ({ code, redirectUri, clientId, clientSecret }) => {
      const data = await postForm("https://www.linkedin.com/oauth/v2/accessToken", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      return data.access_token;
    },
    fetchProfile: async (accessToken) => {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.sub) throw new Error("Failed to fetch LinkedIn profile");
      return {
        uid: `linkedin:${data.sub}`,
        name: data.name || [data.given_name, data.family_name].filter(Boolean).join(" ") || "LinkedIn User",
        email: data.email,
        avatar: data.picture,
      };
    },
  },
  discord: {
    authorizeUrl: "https://discord.com/api/oauth2/authorize",
    scope: "identify email",
    clientIdEnv: "LUMINA_DISCORD_CLIENT_ID",
    clientSecretEnv: "LUMINA_DISCORD_CLIENT_SECRET",
    exchangeCode: async ({ code, redirectUri, clientId, clientSecret }) => {
      const data = await postForm("https://discord.com/api/oauth2/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      return data.access_token;
    },
    fetchProfile: async (accessToken) => {
      const res = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error("Failed to fetch Discord profile");
      const avatar = data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
        : undefined;
      return {
        uid: `discord:${data.id}`,
        name: data.global_name || data.username || "Discord User",
        email: data.email,
        avatar,
      };
    },
  },
};

// ---- Stateless, HMAC-signed CSRF state (no server-side session store needed) ----

function getStateSecret(): string {
  if (process.env.OAUTH_STATE_SECRET) return process.env.OAUTH_STATE_SECRET;
  const g = globalThis as any;
  if (!g.__luminaOAuthEphemeralSecret) {
    console.warn(
      "[oauth] OAUTH_STATE_SECRET not set — using an ephemeral in-memory secret. Fine for local " +
        "dev, but set a real one (and restart) if the server process might restart mid-flow."
    );
    g.__luminaOAuthEphemeralSecret = crypto.randomBytes(32).toString("hex");
  }
  return g.__luminaOAuthEphemeralSecret;
}

function signState(payload: { provider: string; ts: number; nonce: string }): string {
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(json).digest("base64url");
  return `${json}.${sig}`;
}

function verifyState(state: string | undefined, expectedProvider: string): boolean {
  if (!state) return false;
  const [json, sig] = state.split(".");
  if (!json || !sig) return false;
  const expectedSig = crypto.createHmac("sha256", getStateSecret()).update(json).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString());
    if (payload.provider !== expectedProvider) return false;
    if (Date.now() - payload.ts > 10 * 60 * 1000) return false; // 10 minute expiry
    return true;
  } catch {
    return false;
  }
}

// ---- Router ----

export function createOAuthRouter(getAdminAuth: () => AdminAuth): express.Router {
  const router = express.Router();

  router.get("/:provider/start", (req, res) => {
    const providerName = req.params.provider;
    const provider = PROVIDERS[providerName];
    if (!provider) return res.status(404).send("Unknown provider.");

    const clientId = process.env[provider.clientIdEnv];
    if (!clientId) {
      return res
        .status(500)
        .send(`${providerName} sign-in isn't configured on the server yet (missing ${provider.clientIdEnv}).`);
    }

    const redirectUri = `${req.protocol}://${req.get("host")}/auth/${providerName}/callback`;
    const state = signState({ provider: providerName, ts: Date.now(), nonce: crypto.randomBytes(8).toString("hex") });

    const url = new URL(provider.authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", provider.scope);
    url.searchParams.set("state", state);
    for (const [k, v] of Object.entries(provider.extraAuthorizeParams || {})) {
      url.searchParams.set(k, v);
    }

    res.redirect(url.toString());
  });

  router.get("/:provider/callback", async (req, res) => {
    const providerName = req.params.provider;
    const provider = PROVIDERS[providerName];
    if (!provider) return res.status(404).send("Unknown provider.");

    const sendResult = (payload: Record<string, unknown>) => {
      res.set("Content-Type", "text/html");
      res.send(`<!doctype html><html><body style="background:#0b0b0f;color:#fff;font-family:sans-serif">
<script>
  (function(){
    var payload = ${JSON.stringify(payload)};
    if (window.opener) { window.opener.postMessage(payload, window.location.origin); }
    window.close();
  })();
</script>
</body></html>`);
    };

    const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

    if (error) {
      return sendResult({ type: "LUMINA_OAUTH_ERROR", provider: providerName, error: error_description || error });
    }
    if (!code || !verifyState(state, providerName)) {
      return sendResult({
        type: "LUMINA_OAUTH_ERROR",
        provider: providerName,
        error: "Invalid or expired sign-in attempt. Please try again.",
      });
    }

    try {
      const clientId = process.env[provider.clientIdEnv];
      const clientSecret = process.env[provider.clientSecretEnv];
      if (!clientId || !clientSecret) throw new Error(`${providerName} is not configured on the server.`);

      const redirectUri = `${req.protocol}://${req.get("host")}/auth/${providerName}/callback`;
      const accessToken = await provider.exchangeCode({ code, redirectUri, clientId, clientSecret });
      const profile = await provider.fetchProfile(accessToken);

      const customToken = await getAdminAuth().createCustomToken(profile.uid, { provider: providerName });

      sendResult({
        type: "LUMINA_OAUTH_SUCCESS",
        provider: providerName,
        token: customToken,
        profile: { name: profile.name, email: profile.email || null, avatar: profile.avatar || null },
      });
    } catch (e: any) {
      console.error(`[oauth] ${providerName} callback error:`, e);
      sendResult({ type: "LUMINA_OAUTH_ERROR", provider: providerName, error: e.message || "Sign-in failed." });
    }
  });

  return router;
}
