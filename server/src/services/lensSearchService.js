import { uploadTemp } from './imageHostService.js';

// Third-party Google Lens APIs (unofficial, no credit card required for free tier).
// These scrape Google Lens results and return structured JSON.
//
// Supported providers:
//   serpapi     — https://serpapi.com/google-lens-api
//                 100 free searches for new accounts, well-documented.
//   searchapi   — https://www.searchapi.io/docs/google-lens
//                 Free plan available, response structure similar to SerpApi.
//
// Configure via .env:
//   LENS_API_KEY=...                         # single key (backward compatible)
//   LENS_API_KEYS=key1,key2,key3,key4        # multiple keys, rotated on quota/rate-limit
//   LENS_API_PROVIDER=serpapi                # or searchapi

const PROVIDERS = {
  serpapi: {
    buildUrl: (imageUrl, apiKey) =>
      `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(imageUrl)}&api_key=${encodeURIComponent(apiKey)}`,
    headers: () => ({ Accept: 'application/json' }),
    parse: (json) => {
      const matches = json.visual_matches || [];
      const lines = matches
        .slice(0, 8)
        .map((m) => `- ${m.title || ''}${m.source ? ` (${m.source})` : ''}${m.link ? ` → ${m.link}` : ''}`)
        .filter(Boolean);
      if (!lines.length) return null;
      return `## Résultats Google Lens (SerpApi)\n${lines.join('\n')}`;
    },
  },
  searchapi: {
    buildUrl: (imageUrl, apiKey) =>
      `https://www.searchapi.io/api/v1/search?engine=google_lens&url=${encodeURIComponent(imageUrl)}&api_key=${encodeURIComponent(apiKey)}`,
    headers: () => ({ Accept: 'application/json' }),
    parse: (json) => {
      const matches = json.visual_matches || [];
      const lines = matches
        .slice(0, 8)
        .map((m) => `- ${m.title || ''}${m.source ? ` (${m.source})` : ''}${m.link ? ` → ${m.link}` : ''}`)
        .filter(Boolean);
      if (!lines.length) return null;
      return `## Résultats Google Lens (SearchAPI.io)\n${lines.join('\n')}`;
    },
  },
};

/**
 * Collect all API keys from env.
 * Supports both LENS_API_KEY (single) and LENS_API_KEYS (comma-separated list).
 */
function getApiKeys() {
  const keys = [];
  if (process.env.LENS_API_KEYS) {
    keys.push(...process.env.LENS_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean));
  }
  if (process.env.LENS_API_KEY) {
    keys.push(process.env.LENS_API_KEY.trim());
  }
  // Remove duplicates while preserving order.
  return [...new Set(keys)];
}

function isQuotaError(status, message) {
  const m = (message || '').toLowerCase();
  return (
    status === 429 ||
    m.includes('quota') ||
    m.includes('rate limit') ||
    m.includes('limit exceeded') ||
    m.includes('exceeded') ||
    m.includes('usage') ||
    m.includes('too many requests')
  );
}

function extractError(json, fallbackText) {
  if (json?.error) return typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
  if (json?.message) return json.message;
  return fallbackText;
}

/**
 * Perform a Google Lens search via a third-party API and return a compact text
 * context for Gemini. Supports multiple API keys: rotates to the next key when
 * the current one hits quota or rate limit.
 */
export async function lensSearch(buffer, mediaType) {
  const providerName = process.env.LENS_API_PROVIDER || 'serpapi';
  const provider = PROVIDERS[providerName];
  if (!provider) {
    console.warn(`[lensSearch] unknown provider ${providerName}`);
    return null;
  }

  const keys = getApiKeys();
  if (!keys.length) return null;

  // Upload image once — the public URL is reused for every key attempt.
  const publicUrl = await uploadTemp(buffer, mediaType);
  if (!publicUrl) {
    console.warn('[lensSearch] could not host image publicly, skipping');
    return null;
  }

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const res = await fetch(provider.buildUrl(publicUrl, key), {
        headers: provider.headers(),
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      // API-level error in a successful-looking response (SerpApi style).
      if (res.ok && json?.error) {
        const errMsg = extractError(json, text);
        if (isQuotaError(res.status, errMsg)) {
          console.warn(`[lensSearch] key ${i + 1}/${keys.length} quota/rate limit, trying next...`);
          continue;
        }
        console.warn(`[lensSearch] key ${i + 1}/${keys.length} API error: ${errMsg.slice(0, 120)}`);
        return null;
      }

      if (!res.ok) {
        const errMsg = extractError(json, text);
        if (isQuotaError(res.status, errMsg)) {
          console.warn(`[lensSearch] key ${i + 1}/${keys.length} quota/rate limit, trying next...`);
          continue;
        }
        console.warn(`[lensSearch] key ${i + 1}/${keys.length} HTTP ${res.status}: ${errMsg.slice(0, 120)}`);
        return null;
      }

      const context = provider.parse(json);
      if (context) {
        console.log(`[lensSearch] ${providerName} key ${i + 1}/${keys.length} returned context`);
        return context;
      }

      // Empty context from this provider for this image — no point trying other keys.
      return null;
    } catch (err) {
      console.warn(`[lensSearch] key ${i + 1}/${keys.length} request failed:`, err.message);
      // If this was the last key, give up. Otherwise try the next one.
      if (i === keys.length - 1) return null;
    }
  }

  console.warn('[lensSearch] all API keys exhausted');
  return null;
}
