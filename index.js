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
    const { imageBase64, mimeType, bpm } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Image data and mimeType are required' });
    }

    const prompt = `
      Perform a deep, professional facial wellness analysis on this image. 
      The user's measured Heart Rate (BPM) during the scan was: ${bpm || 'N/A'} BPM.
      
      Analyze the following visual markers and correlate them with the BPM if available:
      - Energy: Eye brightness, posture, muscle tone.
      - Skin: Texture, hydration, evenness, dark circles.
      - Sleep: Under-eye bags, puffiness, redness in eyes.
      - Heart: Correlate the provided BPM (${bpm}) with visual signs like skin flushing, earlobe creases, and overall circulation appearance. If BPM is high, look for signs of stress.
      - Sugar: Skin tags, acanthosis nigricans, facial puffiness.
      - Liver: Scleral icterus (yellowing of eyes), skin tone clarity.

      For each category, provide a numeric score (1-100, where 100 is optimal/healthy) and a very concise observation (max 10 words).
      
      Simplified Categories for Analysis:
      1. Energy Level (Instead of Vitality Index)
      2. Skin Health (Instead of Skin Resilience)
      3. Sleep Quality (Instead of Rest Quality)
      4. Face Age (Instead of Biological Age)
      5. Heart Health (Instead of Cardiovascular Harmony)
      6. Sugar Balance (Instead of Metabolic Balance)
      7. Liver Health (Instead of Internal Filter)
      
      Archetype Analysis:
      8. Ancient Archetype: Based on facial features (eyes, jawline, forehead, presence/absence of beard, gender), identify the most matching character from the Mahabharat, Ramayana, or Manusmriti. 
      Include famous figures (Arjuna, Rama, Krishna, Draupadi, Bhishma) or underrated ones such as Barbarika (moral paradox), Ulupi (complex emotion), Iravan (sacrifice), Ekalavya (suppressed talent), Yuyutsu (moral courage), Hidimbi (independent strength), Vidura (ethical wisdom), Mandodari (wise ethics), Shabari (pure devotion), Jambavan (ancient wisdom), Urmila (silent sacrifice), Ahiravan (underworld power), Sulochana (loyal strength), or Manu/Bhrigu (foundational wisdom).
      Provide the name, the epic/text they belong to, a brief "why" reason connecting their facial expression to their core theme, and their "aura" color.
      
      Wellness Insight:
      9. Secret Tip: An ancient, "secret" wellness tip.

      Return ONLY a JSON object with these exact keys: 
      "energy": {"score": number, "observation": "string"},
      "skin": {"score": number, "observation": "string"},
      "sleep": {"score": number, "observation": "string"},
      "age": {"range": "string", "observation": "string"},
      "heart": {"score": number, "observation": "string"},
      "sugar": {"score": number, "observation": "string"},
      "liver": {"score": number, "observation": "string"},
      "archetype": {"name": "string", "reason": "string", "aura": "string"},
      "recommendation": {"action": "string"},
      "secretTip": {"tip": "string"}
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
