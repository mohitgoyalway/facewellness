const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Increase limit for base64 image data
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.post('/analyze', async (req, res) => {
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
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
