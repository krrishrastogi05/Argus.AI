const { GoogleGenerativeAI } = require('@google/generative-ai');

const { env } = require('../config/env');

let model = null;

function getModel() {
  model ??= new GoogleGenerativeAI(env.geminiApiKey).getGenerativeModel({ model: env.geminiModel });
  return model;
}

// Translates the harness's provider-neutral request into a Gemini call.
// request: { prompt: string, media?: { data: base64, mimeType }, json?: boolean }
async function generate({ prompt, media, json }, { signal }) {
  const parts = [{ text: prompt }];
  if (media) parts.push({ inlineData: { data: media.data, mimeType: media.mimeType } });

  const result = await getModel().generateContent(
    {
      contents: [{ role: 'user', parts }],
      // JSON mode: the model returns bare JSON, no markdown fences to strip.
      generationConfig: json ? { responseMimeType: 'application/json' } : undefined,
    },
    { signal },
  );

  return result.response.text();
}

module.exports = {
  name: 'gemini',
  isConfigured: () => Boolean(env.geminiApiKey),
  generate,
};
