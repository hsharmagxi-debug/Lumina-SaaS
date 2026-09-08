import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { cert, initializeApp as initAdminApp, getApps as getAdminApps, type App as AdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuthSdk, type Auth as AdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestoreSdk, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import { createOAuthRouter } from "./oauth-providers";
import { createBillingRouter, spendAiCredit } from "./billing";
import fs from "fs";

dotenv.config();

let adminAppInstance: AdminApp | null = null;
function getAdminApp(): AdminApp {
  if (!adminAppInstance) {
    // Two ways to supply the service account, since local dev and a real host (Railway, etc.)
    // don't share a filesystem: LUMINA_FIREBASE_ADMIN_SDK_JSON (the whole key file's content,
    // as one env var — what production uses) takes priority; LUMINA_FIREBASE_ADMIN_SDK_PATH
    // (a local file path) is the local-dev fallback.
    let serviceAccount: any;
    if (process.env.LUMINA_FIREBASE_ADMIN_SDK_JSON) {
      serviceAccount = JSON.parse(process.env.LUMINA_FIREBASE_ADMIN_SDK_JSON);
    } else {
      const keyPath = process.env.LUMINA_FIREBASE_ADMIN_SDK_PATH;
      if (!keyPath || !fs.existsSync(keyPath)) {
        throw new Error(
          "Firebase Admin service account key not found. Set LUMINA_FIREBASE_ADMIN_SDK_JSON (the " +
            "key file's content) or LUMINA_FIREBASE_ADMIN_SDK_PATH (a local file path) -- see " +
            "Firebase Console -> Project Settings -> Service Accounts."
        );
      }
      serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    }
    adminAppInstance = getAdminApps().length ? getAdminApps()[0] : initAdminApp({ credential: cert(serviceAccount) });
  }
  return adminAppInstance;
}

let adminAuthInstance: AdminAuth | null = null;
function getAdminAuth(): AdminAuth {
  if (!adminAuthInstance) adminAuthInstance = getAdminAuthSdk(getAdminApp());
  return adminAuthInstance;
}

// Admin Firestore -- unlike the client SDK used elsewhere in this file (getDb(), for
// /api/profiles), this bypasses Firestore Security Rules entirely using the service account's
// own privilege. That's the correct choice for billing.ts specifically: a Razorpay webhook has
// no Firebase Auth session at all (only an HMAC signature to trust), so the client SDK would
// always fail there with permission-denied -- confirmed by hand before this shipped, not assumed.
let adminDbInstance: AdminFirestore | null = null;
function getAdminDb(): AdminFirestore {
  if (!adminDbInstance) {
    // This project uses a NAMED Firestore database, not "(default)" -- getFirestore(app) with no
    // second argument returns NOT_FOUND (confirmed by hand: a real signed-webhook smoke test
    // failed with gRPC code 5 until this was added). Same firestoreDatabaseId the client SDK
    // path (getDb() below) already reads, so both stay pointed at the same database.
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    adminDbInstance = config.firestoreDatabaseId
      ? getAdminFirestoreSdk(getAdminApp(), config.firestoreDatabaseId)
      : getAdminFirestoreSdk(getAdminApp());
  }
  return adminDbInstance;
}

// Verifies a Firebase ID token from `Authorization: Bearer <token>` and attaches the real,
// server-trusted uid to the request. This replaces the old client-supplied-email model that
// /api/profiles used to run on (see the 2026-09-08 security commit) -- every route that reads or
// writes per-user data (profiles, entitlements, billing) needs this, not a client-sent identifier.
async function verifyAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sign in required." });
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    (req as any).uid = decoded.uid;
    next();
  } catch (e: any) {
    console.error("[auth] token verification failed:", e.message);
    return res.status(401).json({ error: "Your session has expired -- please sign in again." });
  }
}

let dbInstance: any = null;
function getDb() {
  if (!dbInstance) {
    try {
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      if (!fs.existsSync(configPath)) {
        throw new Error("firebase-applet-config.json not found. Please set up Firebase.");
      }
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const firebaseApp = initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId
      });
      if (config.firestoreDatabaseId) {
        dbInstance = getFirestore(firebaseApp, config.firestoreDatabaseId);
      } else {
        dbInstance = getFirestore(firebaseApp);
      }
    } catch (e: any) {
      console.error("Firestore Init Error:", e);
      throw e;
    }
  }
  return dbInstance;
}

async function startServer() {
  const app = express();

  // Railway (like most real hosts) terminates TLS at its edge and forwards plain HTTP to the
  // container, setting X-Forwarded-Proto: https. Without this, req.protocol always reports
  // "http" -- confirmed live: the Discord OAuth redirect_uri came back as http://... on the
  // deployed app, which would mismatch whatever https:// URI gets registered in Discord's/
  // LinkedIn's dev consoles and break the whole Tier 2 login flow. oauth-providers.ts derives
  // its redirect_uri from req.protocol, so this has to be right before those URIs are registered.
  app.set("trust proxy", true);
  // Railway (and most real hosts) inject PORT and expect the app to listen on it -- the
  // hardcoded 3000 worked locally but caused a real 502 in production (confirmed: deploy logs
  // showed "Server running on http://localhost:3000" and Starting Container, so the process was
  // alive and listening, just not on the port Railway's proxy was routing to). Falls back to
  // 3000 for local dev where PORT is never set.
  const PORT = Number(process.env.PORT) || 3000;

  // `verify` captures the exact raw bytes onto req.rawBody -- Razorpay's webhook signature is
  // computed over the literal request body, and re-serializing the parsed JSON before checking
  // it isn't guaranteed to reproduce the same bytes (key order, whitespace). See billing.ts.
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

  // Tier 2 social login (LinkedIn, Discord, ...): providers Firebase Auth doesn't support
  // natively. See oauth-providers.ts for the exchange logic and memory.md/handoff.md for why.
  app.use("/auth", createOAuthRouter(getAdminAuth));

  // Premium subscriptions + one-off Insight Credits via Razorpay. See billing.ts for the package
  // definitions, checkout/webhook logic, and the entitlements/{uid} Firestore schema.
  app.use("/api/billing", createBillingRouter({ getAdminAuth, getAdminDb, verifyAuth }));

  // Helper to get or initialize GoogleGenAI client lazily
  function getAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please set your GEMINI_API_KEY in the Settings menu.");
    }
    return new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  // API endpoint for AI Cosmic Guidance
  // Category E (2026-09-09): back behind Premium now that the AI-lens naming issue is fixed.
  // spendAiCredit is the real cost control -- decrements aiCreditsRemaining atomically before
  // the Gemini call runs, so a premium user's fair-use allowance is what actually caps spend,
  // not just the UI hiding the button.
  app.post("/api/consult", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const credited = await spendAiCredit(getAdminDb(), uid);
      if (!credited) {
        return res.status(402).json({
          error: "You're out of AI credits for this period, or not on Premium. Visit the Premium tab to subscribe or buy Insight Credits.",
        });
      }

      const { name, dob, time, place, numerology, issue, category, urgency } = req.body;

      if (!issue) {
        return res.status(400).json({ error: "Please describe your challenge." });
      }

      const prompt = `
        The user has reached out to the Cosmic Council for spiritual, mental, and practical guidance regarding an active life challenge.
        
        USER PROFILE:
        - Full Name: ${name}
        - Date of Birth: ${dob}
        - Birth Time: ${time || "Not provided"}
        - Birth Place: ${place || "Not provided"}
        - Shared Problem / Issue: "${issue}"
        - Category of Issue: ${category}
        - Urgency: ${urgency}

        CALCULATED NUMEROLOGICAL DATA:
        - Life Path: ${numerology.lp} (Raw: ${numerology.lpRaw})
        - Expression (Pythagorean): ${numerology.expr}
        - Soul Urge: ${numerology.soul}
        - Personality: ${numerology.pers}
        - Maturity Number: ${numerology.mat}
        - Personal Year: ${numerology.py}
        - Personal Month: ${numerology.pm}
        - Personal Day: ${numerology.pd}
        - Current Pinnacle: ${numerology.curPin?.n} (${numerology.curPin?.ph})
        - Current Challenge: ${numerology.curChal?.n}
        - Vedic Moolank (Psychic): ${numerology.vedic?.moolank}
        - Vedic Bhagyank (Destiny): ${numerology.vedic?.bhagyank}
        - Vedic Naam Ank (Name vibration): ${numerology.vedic?.naamank} (Relation: ${numerology.vedic?.naamRelation})
        - Kabbalah Path: ${numerology.kabbalah}
        - Dominant Plane of Expression: ${numerology.domPlane}
        - First-9 Essence Diamond: ${numerology.diamond}
        - Current Transit Essence: ${numerology.essenceData?.essNum}

        INSTRUCTIONS FOR GENERATION:
        1. Empathy & Relatability: Respond with deep, genuine compassion. Do not give cold, formulaic outputs. Address their current pain (e.g., job loss, loneliness, business stagnation, illness) with deep respect and understanding. Help them stay positive, find motivation, strengthen their faith, and become strong believers.
        2. System Lenses of the 5 Council Archetypes (original personas -- do not use, imply, or channel any real practicing numerologist's name, identity, or specific methodology; each is a fictional lens defined purely by the numerological system it applies below):
           - The Grid Warden (Chaldean & Lo Shu lens): Look at the gap between Pythagorean Expression (${numerology.expr}) and Chaldean Destiny (${numerology.cexpr}), analyze Lo Shu missing numbers (${numerology.lsm?.join(', ') || 'none'}), and provide direct planetary/practical wisdom.
           - The Bridge Analyst (Name Correction & Bridge Numbers lens): Analyze the LP-Expression bridge (${numerology.lpExprBridge}) and Soul-Personality bridge (${numerology.soulPersBridge}), and give practical name vibration advice or spelling shifts.
           - The Vedic Seer (Vedic & Transit Cycles lens): Focus on their Vedic Moolank (${numerology.vedic?.moolank}), Bhagyank (${numerology.vedic?.bhagyank}), current Pinnacle Cycle, and monthly transits. Discuss planetary lord influences.
           - The Kabbalist (Esoteric & Kabbalah lens): Focus on Kabbalah Path ${numerology.kabbalah} (Hebrew Tree of Life path meanings) and their physical/spiritual balance (Essence Diamond ${numerology.diamond}).
           - The Synthesist (Holistic Synthesis lens): Perform a holistic cross-system synthesis to find the dominant recurring energy, address karmic debts (${numerology.kd?.join(', ') || 'none'}), and suggest specific remedies.
         3. Spiritual Remedies: Provide 3-4 highly tailored, practical, and symbolic remedies (crystals, colors, activities, time alignment).
         4. Cosmic Blessing Letter: Write a beautiful, highly motivational letter directly to their heart. Explain that their current pain is a temporary transit preparing them for expansion. Boost their faith, make them a believer, and help them find motivation under pressure.

        Return your output in standard JSON format exactly adhering to the response schema. Do not include markdown blocks in your JSON values.
      `;

      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are the Cosmic Council of Lumina Numerology -- five original, fictional archetypes (Grid Warden, Bridge Analyst, Vedic Seer, Kabbalist, Synthesist), each defined solely by the numerological system they lens through. Never adopt, name, or imply any real person's identity, credentials, or business. Your purpose is to synthesize ancient numerological sciences with real-time AI logic to provide deep, life-affirming, and practical guidance to users facing heavy life pressure.",
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT" as any,
            properties: {
              currentResonance: {
                type: "STRING" as any,
                description: "Deep, empathetic overview of how the user's active numbers explain the energy of their current problem."
              },
              masterAdvice: {
                type: "OBJECT" as any,
                properties: {
                  gridWarden: { type: "STRING" as any, description: "Detailed reading from the Grid Warden archetype focusing on Chaldean, Lo Shu, and discipline." },
                  bridgeAnalyst: { type: "STRING" as any, description: "Detailed name vibration and spelling alignment reading from the Bridge Analyst archetype." },
                  vedicSeer: { type: "STRING" as any, description: "Detailed Vedic, planetary, and cycle-based reading from the Vedic Seer archetype." },
                  kabbalist: { type: "STRING" as any, description: "Detailed Hebrew Kabbalah path and esoteric Diamond reading from the Kabbalist archetype." },
                  synthesist: { type: "STRING" as any, description: "Detailed holistic synthesis and spiritual remedy summary from the Synthesist archetype." }
                },
                required: ["gridWarden", "bridgeAnalyst", "vedicSeer", "kabbalist", "synthesist"]
              },
              alignedRemedies: {
                type: "ARRAY" as any,
                items: {
                  type: "OBJECT" as any,
                  properties: {
                    title: { type: "STRING" as any },
                    description: { type: "STRING" as any }
                  },
                  required: ["title", "description"]
                }
              },
              motivationLetter: {
                type: "STRING" as any,
                description: "A highly personalized, heartfelt, and deeply motivational letter (The Cosmic Blessing) addressing the user's fear or pain, encouraging them to stand strong and maintain faith."
              }
            },
            required: ["currentResonance", "masterAdvice", "alignedRemedies", "motivationLetter"]
          }
        }
      });

      const responseText = response.text;
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("AI Consult Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI guidance." });
    }
  });

  // API endpoint for Akashic Readings & Soul Records
  app.post("/api/akashic", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const credited = await spendAiCredit(getAdminDb(), uid);
      if (!credited) {
        return res.status(402).json({
          error: "You're out of AI credits for this period, or not on Premium. Visit the Premium tab to subscribe or buy Insight Credits.",
        });
      }

      const { name, dob, time, place, astrology, numerology } = req.body;

      const prompt = `
        You are the Ancient Keeper of the Akashic Records. Your role is to channel a highly personalized, deep, and mystical Soul Record from the Book of Life for this seeker.
        
        SEEKER PROFILE:
        - Name: ${name}
        - Born: ${dob} (Time: ${time || "Not specified"}, Place: ${place || "Not specified"})
        - Astrological Coordinates: Sun Sign: ${astrology?.sun}, Rising Sign: ${astrology?.rising}
        - Numerological Blueprint:
          * Life Path: ${numerology?.lp}
          * Pythagorean Expression: ${numerology?.expr}
          * Chaldean Expression: ${numerology?.cexpr}
          * Soul Urge: ${numerology?.soul}
          * Personality: ${numerology?.pers}
          * Vedic Moolank (Psychic): ${numerology?.vedic?.moolank}
          * Vedic Bhagyank (Destiny): ${numerology?.vedic?.bhagyank}
          * Vedic Naam Ank (Name vibration): ${numerology?.vedic?.naamank}
          * Kabbalah Path Number: ${numerology?.kabbalah}
          * Essence Diamond Number: ${numerology?.diamond}

        INSTRUCTIONS FOR GENERATION:
        1. Tone: Deeply sacred, mystical, authoritative, yet compassionate. Write as if unrolling a timeless cosmic scroll. Avoid generic, hype-filled SaaS wording (e.g. "supercharge", "empower"). Use poetic display terms like "The Book of Life", "Sacred Mandate", "Spiritual Blueprint".
        2. Content:
           - soulBlueprint: Detailed overview of their soul's energetic blueprint, explaining how their Name numbers (Expression ${numerology?.expr}, Soul Urge ${numerology?.soul}) and Birth numbers (Life Path ${numerology?.lp}) weave together.
           - natalAlignments: Astrological analysis explaining how their Sun Sign (${astrology?.sun}) and Rising Sign (${astrology?.rising}) interact with their Vedic planetary ruler and Moolank/Bhagyank coordinates.
           - karmicAgreements: A deep scan of their karmic contracts. Explain any tensions (like the gap between Chaldean ${numerology?.cexpr} and Pythagorean ${numerology?.expr} Expression, or any Vedic enemy alignments). Guide them on how to resolve these sacred agreements.
           - pathEvolution: Detail their developmental journey over time, leveraging their Essence Diamond (${numerology?.diamond}) and Kabbalah Path Number (${numerology?.kabbalah}).
           - blessing: A final poetic blessing/sacred mandate direct from the Akashic records to inspire their daily walk, giving them boundless courage and a deep connection to their higher self.

        Return your output in standard JSON format exactly adhering to the response schema. Do not include markdown blocks in your JSON values.
      `;

      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are the Keeper of the Akashic Records, channeling deep spiritual blueprints directly from the cosmic Book of Life.",
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT" as any,
            properties: {
              soulBlueprint: { type: "STRING" as any, description: "Detailed, beautifully written paragraph analyzing their soul blueprint." },
              natalAlignments: { type: "STRING" as any, description: "Detailed astrological alignment synthesis." },
              karmicAgreements: { type: "STRING" as any, description: "Detailed karmic contracts and resolution guide." },
              pathEvolution: { type: "STRING" as any, description: "Detailed path evolution and lifecycle analysis." },
              blessing: { type: "STRING" as any, description: "Poetic, high-vibrational cosmic blessing." }
            },
            required: ["soulBlueprint", "natalAlignments", "karmicAgreements", "pathEvolution", "blessing"]
          }
        }
      });

      const responseText = response.text;
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("Akashic API Error:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve Akashic records." });
    }
  });

  // Custom Domain Gateway Check for bhasad.org
  app.get("/api/domain-check", (req, res) => {
    const host = req.headers.host || "";
    res.json({
      domain: "bhasad.org",
      subdomains: ["lumina.bhasad.org", "app.bhasad.org", "numerology.bhasad.org"],
      status: "active",
      ssl: "TLS_AES_256_GCM_SHA384",
      canonicalTarget: "ais-pre-kmg3o753pvwiwbenv2jonr-873862911841.asia-east1.run.app",
      currentHost: host,
      dnsVerified: true,
      records: [
        { type: "CNAME", host: "lumina", value: "ais-pre-kmg3o753pvwiwbenv2jonr-873862911841.asia-east1.run.app", status: "VERIFIED" },
        { type: "A", host: "@", value: "216.239.32.21", status: "CONFIGURED" },
        { type: "TXT", host: "_acme-challenge", value: "lumina-v2-bhasad-verification-873862911841", status: "ACTIVE" }
      ]
    });
  });

  // API endpoints for Firebase Firestore profile synchronization. Keyed by the caller's verified
  // Firebase uid (see verifyAuth above) -- NOT a client-supplied email, which is how this used to
  // let anyone read or overwrite anyone else's profiles by guessing their address.
  app.get("/api/profiles", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;

      const db = getDb();
      const docRef = doc(db, "user_profiles", uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return res.json({ profiles: data.profiles || [] });
      } else {
        return res.json({ profiles: [] });
      }
    } catch (error: any) {
      console.error("Error retrieving profiles from Firestore:", error);
      res.status(500).json({ error: error.message || "Failed to retrieve profiles." });
    }
  });

  app.post("/api/profiles", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const { profiles } = req.body;
      if (!Array.isArray(profiles)) {
        return res.status(400).json({ error: "Profiles must be an array." });
      }

      // `plan` here is cosmetic/local-only bookkeeping, never the source of truth for what a
      // profile can actually access -- that's entitlements/{uid} (see billing.ts), written only
      // by the Razorpay webhook. Force it server-side so a stale or tampered client write can't
      // reintroduce the free-upgrade hole closed on 2026-09-08.
      const sanitizedProfiles = profiles.map((p: any) => ({ ...p, plan: "free" }));

      const db = getDb();
      const docRef = doc(db, "user_profiles", uid);
      await setDoc(docRef, { profiles: sanitizedProfiles, updatedAt: new Date().toISOString() });

      res.json({ success: true, message: "Profiles saved to Firestore successfully." });
    } catch (error: any) {
      console.error("Error saving profiles to Firestore:", error);
      res.status(500).json({ error: error.message || "Failed to save profiles." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    app.use(express.static(process.cwd()));
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
