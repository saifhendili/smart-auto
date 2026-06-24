import { GoogleGenerativeAI } from '@google/generative-ai';
import Jimp from 'jimp';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === '...') {
  console.error('Set GEMINI_API_KEY first');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// 1. Minimal text-only call (no image, no search)
async function testTextOnly(modelName) {
  console.log(`\n--- Test 1: text-only ${modelName} ---`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent('Say "pong"');
    console.log('OK:', result.response.text().trim());
    return true;
  } catch (err) {
    console.error('FAIL:', err.message);
    return false;
  }
}

// 2. Small image only (no search)
async function testImageOnly(modelName) {
  console.log(`\n--- Test 2: image-only ${modelName} ---`);
  try {
    const img = new Jimp(512, 512, 0xff0000ff);
    const buffer = await img.getBufferAsync(Jimp.MIME_JPEG);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([
      { inlineData: { data: buffer.toString('base64'), mimeType: 'image/jpeg' } },
      'What color is this? One word.',
    ]);
    console.log('OK:', result.response.text().trim());
    return true;
  } catch (err) {
    console.error('FAIL:', err.message);
    return false;
  }
}

// 3. Image + Google Search grounding
async function testImageWithSearch(modelName) {
  console.log(`\n--- Test 3: image + googleSearch ${modelName} ---`);
  try {
    const img = new Jimp(512, 512, 0xff0000ff);
    const buffer = await img.getBufferAsync(Jimp.MIME_JPEG);
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ googleSearch: {} }],
    });
    const result = await model.generateContent([
      { inlineData: { data: buffer.toString('base64'), mimeType: 'image/jpeg' } },
      'What is this? Use search if useful.',
    ]);
    console.log('OK:', result.response.text().trim().slice(0, 200));
    return true;
  } catch (err) {
    console.error('FAIL:', err.message);
    return false;
  }
}

async function main() {
  const models = ['gemini-2.0-flash', 'gemini-2.5-flash'];
  for (const model of models) {
    await testTextOnly(model);
    await testImageOnly(model);
    await testImageWithSearch(model);
  }
}

main();
