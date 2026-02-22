const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');

// Helper to manage stats
const getStats = () => {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) {
    return { visits: 0, scans: 0, results: 0, errors: [] };
  }
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
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Image data and mimeType are required' });
    }

    const prompt = `
      Perform a professional facial wellness analysis on this image. 
      For each of the following categories, provide a numeric score (1-100, where 100 is optimal) and a concise observation (max 15 words).
      
      Categories:
      1. Vitality Index (Reflects stress and energy levels)
      2. Skin Resilience (Texture, clarity, and hydration)
      3. Rest Quality (Signs of sleep debt or fatigue)
      4. Biological Age Estimate (Numeric range)
      5. Wellness Recommendation (A single, actionable habit)

      Return ONLY a JSON object with these exact keys: 
      "vitality": {"score": number, "observation": "string"},
      "skin": {"score": number, "observation": "string"},
      "rest": {"score": number, "observation": "string"},
      "age": {"range": "string", "observation": "string"},
      "recommendation": {"action": "string"}
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
