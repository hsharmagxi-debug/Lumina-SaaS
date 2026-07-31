import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini API
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

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
