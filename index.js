const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

const getStats = () => {
  try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); }
  catch (e) { return { visits: 0, scans: 0, results: 0, errors: [] }; }
};

const getHistory = () => {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch (e) { return []; }
};

const saveHistory = (record) => {
  const history = getHistory();
  history.push({ ...record, timestamp: new Date().toISOString() });
  if (history.length > 1000) history.shift();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

const calculatePercentile = (ageRange, wellnessIndex) => {
  const history = getHistory();
  const sameAgeHistory = history.filter(h => h.ageRange === ageRange);
  if (sameAgeHistory.length < 5) return 85;
  const lowerScores = sameAgeHistory.filter(h => h.wellnessIndex <= wellnessIndex).length;
  return Math.round((lowerScores / sameAgeHistory.length) * 100);
};

const updateStats = (updater) => {
  const stats = getStats(); updater(stats);
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
};

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

app.post('/analyze', async (req, res) => {
  updateStats(s => s.scans++);
  try {
    const { imageBase64, mimeType, biometrics } = req.body;
    if (!imageBase64 || !mimeType) return res.status(400).json({ error: 'Image and mimeType required' });

    const prompt = `
      Perform a deep, professional facial wellness and biometric analysis on this image. 
      You are a Digital Bio-Scanner.
      
      BIOMETRICS FROM SCAN:
      - Heart Rate: ${biometrics?.bpm || 'N/A'} BPM
      - Respiration: ${biometrics?.respiration || 'N/A'} br/m
      - Blink Rate: ${biometrics?.blinkRate || 'N/A'} blinks/min

      TASK:
      1. VITALS: Compare biometrics against standard resting ranges (BPM 60-100, Resp 12-20).
      2. DERMATOLOGY: Score (1-100) Acne, UV damage, Hydration, Pore size, Oiliness.
      3. SYSTEMIC: Screen for Anemia (lid/lip pallor) and Jaundice (eye yellowing).
      4. WELLNESS SCORE: Create an Overall Wellness Score (1-100).
      5. ARCHETYPE ANALYSIS: Match the face to a character from Mahabharat (Arjuna, Bhima, Karna, Krishna, Draupadi, Bhishma, Yuyutsu, Ekalavya, Barbarika, Ulupi, Iravan, Vidura) or Ramayana (Rama, Sita, Hanuman, Ravana, Lakshmana, Bharata, Urmila, Mandodari, Shabari, Jambavan).
         Provide: "name", "reason" (max 20 words), "aura" (hex color code).
      6. SECRET TIP: Provide an ancient, profound "secret" wellness tip (max 15 words).

      Return ONLY a JSON object:
      {
        "vitals": {
          "heartRate": {"value": number},
          "respiration": {"value": number},
          "stress": {"score": number, "observation": "string"}
        },
        "dermatology": {
          "acne": number, "uvDamage": number, "hydration": number, "poreSize": number
        },
        "systemic": {
          "anemiaRisk": {"level": "Low/Med/High"},
          "jaundiceRisk": {"level": "Low/Med/High"}
        },
        "lifestyle": {
          "sleepQuality": {"score": number}
        },
        "age": {"biologicalAge": "string"},
        "wellnessIndex": number,
        "archetype": {"name": "string", "reason": "string", "aura": "string"},
        "secretTip": {"tip": "string"}
      }
    `;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType: mimeType } }, prompt]);
    const response = await result.response;
    const text = response.text().trim();
    console.log("Raw Gemini Response:", text);
    
    let jsonOutput;
    try {
      const start = text.indexOf('{'); const end = text.lastIndexOf('}') + 1;
      if (start !== -1 && end !== -1) {
        jsonOutput = JSON.parse(text.substring(start, end));
      } else {
        throw new Error("Could not find JSON in response");
      }
    } catch (e) { 
        console.error("JSON Parse Error:", e.message);
        jsonOutput = { raw: text }; 
    }

    const wellnessIndex = jsonOutput.wellnessIndex || 70;
    const ageRange = jsonOutput.age?.biologicalAge || 'Unknown';
    jsonOutput.percentile = calculatePercentile(ageRange, wellnessIndex);
    saveHistory({ ageRange, wellnessIndex });

    res.json(jsonOutput);
    updateStats(s => s.results++);
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

app.listen(port, () => console.log(`Server on port ${port}`));
