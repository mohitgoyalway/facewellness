const fs = require('fs');
const path = require('path');

async function testAnalyze() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: node test-analyze.js <image-path>');
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = `image/${path.extname(imagePath).slice(1)}`;

  try {
    const response = await fetch('http://localhost:3000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64,
        mimeType,
      }),
    });

    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error testing analyze endpoint:', error.message);
  }
}

testAnalyze();