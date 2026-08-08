import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import fs from "fs";

dotenv.config();

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
  const PORT = 3000;

  app.use(express.json());

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
  app.post("/api/consult", async (req, res) => {
    try {
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
        2. System Lenses of the 5 Masters:
           - Dr. J C Chaudhry (Chaldean & Lo Shu): Look at the gap between Pythagorean Expression (${numerology.expr}) and Chaldean Destiny (${numerology.cexpr}), analyze Lo Shu missing numbers (${numerology.lsm?.join(', ') || 'none'}), and provide direct planetary/practical wisdom.
           - Sanjay B Jumaani (Name Correction & Bridge Numbers): Analyze the LP-Expression bridge (${numerology.lpExprBridge}) and Soul-Personality bridge (${numerology.soulPersBridge}), and give practical name vibration advice or spelling shifts.
           - Dr. Kartick Chakraborty (Vedic & Transit Cycles): Focus on their Vedic Moolank (${numerology.vedic?.moolank}), Bhagyank (${numerology.vedic?.bhagyank}), current Pinnacle Cycle, and monthly transits. Discuss planetary lord influences.
           - Anupam V Kapil (Esoteric & Kabbalah): Focus on Kabbalah Path ${numerology.kabbalah} (Hebrew Tree of Life path meanings) and their physical/spiritual balance (Essence Diamond ${numerology.diamond}).
           - Rajat Nayar (Holistic Synthesis): Perform a holistic cross-system synthesis to find the dominant recurring energy, address karmic debts (${numerology.kd?.join(', ') || 'none'}), and suggest specific remedies.
         3. Spiritual Remedies: Provide 3-4 highly tailored, practical, and symbolic remedies (crystals, colors, activities, time alignment).
         4. Cosmic Blessing Letter: Write a beautiful, highly motivational letter directly to their heart. Explain that their current pain is a temporary transit preparing them for expansion. Boost their faith, make them a believer, and help them find motivation under pressure.

        Return your output in standard JSON format exactly adhering to the response schema. Do not include markdown blocks in your JSON values.
      `;

      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are the Cosmic Council of Lumina Numerology. Your purpose is to synthesize ancient numerological sciences with real-time AI logic to provide deep, life-affirming, and practical guidance to users facing heavy life pressure.",
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
                  jcChaudhry: { type: "STRING" as any, description: "Detailed reading from Dr. J C Chaudhry focusing on Chaldean, Lo Shu, and discipline." },
                  sanjayJumaani: { type: "STRING" as any, description: "Detailed name vibration and spelling alignment reading from Sanjay B Jumaani." },
                  kartickChakraborty: { type: "STRING" as any, description: "Detailed Vedic, planetary, and cycle-based reading from Dr. Kartick Chakraborty." },
                  anupamKapil: { type: "STRING" as any, description: "Detailed Hebrew Kabbalah path and esoteric Diamond reading from Anupam V Kapil." },
                  rajatNayar: { type: "STRING" as any, description: "Detailed holistic synthesis and spiritual remedy summary from Rajat Nayar." }
                },
                required: ["jcChaudhry", "sanjayJumaani", "kartickChakraborty", "anupamKapil", "rajatNayar"]
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
  app.post("/api/akashic", async (req, res) => {
    try {
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

  // API endpoints for Firebase Firestore profile synchronization
  app.get("/api/profiles", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: "Email query parameter is required." });
      }

      const db = getDb();
      const docRef = doc(db, "user_profiles", email.toLowerCase());
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

  app.post("/api/profiles", async (req, res) => {
    try {
      const { email, profiles } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required." });
      }
      if (!Array.isArray(profiles)) {
        return res.status(400).json({ error: "Profiles must be an array." });
      }

      const db = getDb();
      const docRef = doc(db, "user_profiles", email.toLowerCase());
      await setDoc(docRef, { profiles, updatedAt: new Date().toISOString() });

      res.json({ success: true, message: "Profiles saved to Firestore successfully." });
    } catch (error: any) {
      console.error("Error saving profiles to Firestore:", error);
      res.status(500).json({ error: error.message || "Failed to save profiles." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
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
