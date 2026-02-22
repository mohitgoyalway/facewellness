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
      Analyze this image of a human face and provide estimates/insights for the following:
      1. Stress level: (low, medium, high with explanation)
      2. Tiredness: (not tired, slightly tired, very tired)
      3. Estimated Age: (numeric range)
      4. Visible skin observations: (e.g., texture, clarity, hydration)
      5. Fatigue signs: (e.g., dark circles, puffiness)
      6. Potential lifestyle habits based on facial cues: (e.g., hydration, sleep, sun exposure)

      Return ONLY the response as a structured JSON object with these keys: "stressLevel", "tiredness", "estimatedAge", "skinObservations", "fatigueSigns", "lifestyleHabits". Do not include any additional text or formatting.
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
