const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

// Helper to manage stats
const getStats = () => {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) {
    return { visits: 0, scans: 0, results: 0, errors: [] };
  }
};

const getHistory = () => {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
};

const saveHistory = (record) => {
  const history = getHistory();
  history.push({ ...record, timestamp: new Date().toISOString() });
  // Keep last 1000 records
  if (history.length > 1000) history.shift();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

const calculatePercentile = (ageRange, wellnessIndex) => {
  const history = getHistory();
  const sameAgeHistory = history.filter(h => h.ageRange === ageRange);
  if (sameAgeHistory.length < 5) return 85; // Default for low sample size
  
  const lowerScores = sameAgeHistory.filter(h => h.wellnessIndex <= wellnessIndex).length;
  return Math.round((lowerScores / sameAgeHistory.length) * 100);
};

const updateStats = (updater) => {
  const stats = getStats();
  updater(stats);
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
};

// Increase limit for base64 image data
app.use(express.json({ limit: '10mb' }));

// Tracking Middleware
app.get('/', (req, res, next) => {
  updateStats(s => s.visits++);
  next();
});

app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Admin Stats Endpoint (Basic Auth)
app.post('/api/stats', (req, res) => {
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(getStats());
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post('/analyze', async (req, res) => {
  updateStats(s => s.scans++);
  try {
    const { imageBase64, mimeType, biometrics } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Image data and mimeType are required' });
    }

    const prompt = `
      Perform a deep, professional facial wellness and biometric analysis on this image. 
      You are acting as a Digital Bio-Scanner.
      
      RECORDED BIOMETRICS (Deterministically calculated from 15-second video stream):
      - Heart Rate: ${biometrics?.bpm || 'N/A'} BPM
      - Respiration Rate: ${biometrics?.respiration || 'N/A'} breaths/min
      - Blink Rate: ${biometrics?.blinkRate || 'N/A'} blinks/min
      - HRV (Heart Rate Variability Proxy): ${biometrics?.hrv || 'N/A'} ms

      TASK:
      Analyze the provided image and synthesize it with the recorded biometrics to provide a comprehensive health report.

      1. VITALS ANALYSIS:
         - Compare the BPM and Respiration against standard resting ranges (BPM 60-100, Resp 12-20).
         - Use the Blink Rate to infer Stress/Autonomic Nervous System activity.

      2. DERMATOLOGICAL MARKERS:
         - Detect and score (1-100): Acne, Rosacea, Hyperpigmentation, Wrinkles, UV damage, Pore size, Skin hydration (proxy), and Oiliness.

      3. SYSTEMIC & CLINICAL SCREENING:
         - Anemia: Check for paleness in the lower eyelid (conjunctiva) and lip pallor.
         - Jaundice: Check for yellowing (bilirubin signal) in the sclera (white of eyes).

      4. CARDIOMETABOLIC & LIFESTYLE:
         - Estimate Biological Age and compare to "Face Age".
         - Infer "Facial Adiposity" to estimate BMI/Cardiovascular risk.
         - Detect signs of Sleep Deprivation (bags, dark circles, dullness).

      5. WELLNESS INDEX:
         - Create a composite "Overall Wellness Score" (1-100) based on vitals, skin, and systemic signs.

      6. ARCHETYPE ANALYSIS:
         - Ancient Archetype: Based on facial features (eyes, jawline, forehead, presence/absence of beard, gender), identify the most matching character from the Mahabharat, Ramayana, or Manusmriti. 
         - Include famous figures (Arjuna, Rama, Krishna, Draupadi, Bhishma) or underrated ones such as Barbarika (moral paradox), Ulupi (complex emotion), Iravan (sacrifice), Ekalavya (suppressed talent), Yuyutsu (moral courage), Hidimbi (independent strength), Vidura (ethical wisdom), Mandodari (wise ethics), Shabari (pure devotion), Jambavan (ancient wisdom), Urmila (silent sacrifice), Ahiravan (underworld power), Sulochana (loyal strength), or Manu/Bhrigu (foundational wisdom).
         - Provide the name, the epic/text they belong to, a brief "why" reason connecting their facial expression to their core theme, and their "aura" color.

      7. WELLNESS INSIGHT:
         - Secret Tip: An ancient, "secret" wellness tip.

      Return ONLY a JSON object with this exact structure:
      {
        "vitals": {
          "heartRate": {"value": number, "status": "string"},
          "respiration": {"value": number, "status": "string"},
          "stress": {"score": number, "observation": "string"}
        },
        "dermatology": {
          "acne": {"score": number},
          "hyperpigmentation": {"score": number},
          "wrinkles": {"score": number},
          "hydration": {"score": number},
          "uvDamage": {"score": number}
        },
        "systemic": {
          "anemiaRisk": {"level": "Low/Med/High", "observation": "string"},
          "jaundiceRisk": {"level": "Low/Med/High", "observation": "string"}
        },
        "lifestyle": {
          "sleepQuality": {"score": number, "observation": "string"},
          "cardioRisk": {"level": "Low/Med/High", "observation": "string"}
        },
        "wellnessIndex": number,
        "age": {"faceAge": "string", "biologicalAge": "string"},
        "archetype": {"name": "string", "reason": "string", "aura": "string"},
        "secretTip": {"tip": "string"}
      }
    `;

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      },
      prompt
    ]);
    ]);

    const response = await result.response;
    const text = response.text().trim();
    
    // Attempt to extract and parse JSON from the response
    let jsonOutput;
    try {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonOutput = JSON.parse(text.substring(jsonStart, jsonEnd));
      } else {
        jsonOutput = { raw: text };
      }
    } catch (e) {
      console.warn('JSON parsing failed, returning raw text.', e);
      jsonOutput = { raw: text };
    }

    // Add extra calculated fields
    if (jsonOutput.energy && jsonOutput.skin && jsonOutput.sleep && jsonOutput.heart && jsonOutput.sugar && jsonOutput.liver) {
        const scores = [
            jsonOutput.energy.score, 
            jsonOutput.skin.score, 
            jsonOutput.sleep.score, 
            jsonOutput.heart.score, 
            jsonOutput.sugar.score, 
            jsonOutput.liver.score
        ].filter(s => typeof s === 'number');
        
        const wellnessIndex = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const ageRange = jsonOutput.age ? jsonOutput.age.range : 'Unknown';
        
        jsonOutput.wellnessIndex = wellnessIndex;
        jsonOutput.percentile = calculatePercentile(ageRange, wellnessIndex);
        
        saveHistory({ ageRange, wellnessIndex });
    }

    res.json(jsonOutput);
    updateStats(s => s.results++);
  } catch (error) {
    console.error('Analysis error:', error);
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack ? error.stack.split('\n')[0] : ''
    };
    updateStats(s => {
      s.errors.unshift(errorEntry);
      if (s.errors.length > 50) s.errors.pop(); // Keep only last 50
    });
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
