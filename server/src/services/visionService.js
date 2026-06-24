import { GoogleGenerativeAI } from '@google/generative-ai';
import Jimp from 'jimp';
import { lensSearch } from './lensSearchService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Detection strategy ─────────────────────────────────────────────────────
// 1. Optional third-party Google Lens API (SerpApi / SearchAPI.io) — searches
//    the web using the actual image pixels. Enable by setting LENS_API_KEY
//    and LENS_API_PROVIDER in .env. Free tiers available, no credit card.
// 2. gemini-2.5-flash + Google Search grounding — identifies the part and
//    extracts structured JSON using both the image and the web context.
// 3. gemini-2.5-flash without search — fallback if the search call fails.

const MAX_IMAGE_DIMENSION = 1536;
const JPEG_QUALITY = 85;

const EXTRACTION_SCHEMA = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'object',
    properties: {
      texteVisible: {
        type: 'string',
        description: 'Tout texte/numéro/logo réellement lisible sur la pièce. Vide si aucun.',
      },
      indices: {
        type: 'string',
        description: 'Indices visuels (forme, fixations, connecteurs) utilisés pour identifier la pièce.',
      },
      nom:             { type: 'string',  description: 'Nom de la pièce automobile' },
      categorie: {
        type: 'string',
        description: 'Catégorie parmi : Moteur, Transmission, Freinage, Suspension, Direction, Électrique, Carrosserie, Intérieur, Climatisation, Échappement, Alimentation, Refroidissement, Autre',
      },
      marqueVehicule:  { type: 'string',  description: 'Marque du véhicule compatible (vide si indéterminable)' },
      typeVehicule:    { type: 'string',  description: 'Type / modèle du véhicule (vide si indéterminable)' },
      reference:       { type: 'string',  description: 'Référence OEM lisible sur la pièce (vide sinon — ne jamais inventer)' },
      anneeFabrication:{ type: 'integer', description: "Année estimée d'après la période de production (0 si indéterminable)" },
      couleur:         { type: 'string',  description: 'Couleur de la pièce (vide si indéterminable)' },
      description:     { type: 'string',  description: 'Description détaillée de la pièce' },
      emplacement:     { type: 'string',  description: 'Emplacement de la pièce dans le véhicule' },
      confiance:       { type: 'number',  description: 'Score de confiance global entre 0 et 1' },
    },
    required: [
      'texteVisible', 'indices', 'nom', 'categorie',
      'marqueVehicule', 'typeVehicule', 'reference',
      'anneeFabrication', 'couleur', 'description', 'emplacement', 'confiance',
    ],
  },
};

const SYSTEM_WITH_CONTEXT = `Tu es un expert en pièces détachées automobiles.
On te fournit une image d'une pièce ET un contexte web issu d'une recherche Google intégrée (comme Google Lens).

RÈGLES — suis-les dans l'ordre :
1. RÉFÉRENCE : ne reporte QUE ce qui est réellement lisible sur la pièce. N'invente JAMAIS.
2. MARQUE/MODÈLE/ANNÉE : fais ta MEILLEURE DÉDUCTION. Utilise le contexte web, la forme, les fixations et les connecteurs. Même sans marquage visible, essaie d'identifier le véhicule le plus probable. Ne laisse ces champs vides que si vraiment aucun indice n'existe.
3. CONFIANCE : baisse fortement la confiance (vers 0.3–0.5) quand tu déduis sans preuve visuelle directe.
4. NOM/CATÉGORIE : identifie précisément la pièce (feu arrière, feu stop, clignotant, etc.).`;

const SYSTEM_NO_CONTEXT = `Tu es un expert en pièces détachées automobiles et en identification de véhicules.
À partir d'une image, tu identifies la pièce et tu extrais le MAXIMUM d'informations.
1. LIS tout texte visible : références OEM, codes de moulage, logos de marque.
2. OBSERVE la forme, les fixations, les connecteurs pour déduire marque/modèle/année.
3. Fais ta MEILLEURE DÉDUCTION pour marqueVehicule, typeVehicule et anneeFabrication, même avec peu d'indices. Ne laisse ces champs vides que si absolument aucun indice n'existe.
4. N'invente JAMAIS une référence ; laisse vide si illisible.
5. Baisse la confiance quand tu devines.`;

// ── Image preprocessing ────────────────────────────────────────────────────
// Phone photos are often 3-4K. Resizing + compressing keeps tokens low and
// detail high, and avoids API size/quality issues.
async function preprocessImage(buffer, mediaType) {
  try {
    const image = await Jimp.read(buffer);
    const w = image.getWidth();
    const h = image.getHeight();

    if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
      image.scaleToFit(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
    }

    if (mediaType === 'image/png') {
      return {
        buffer: await image.getBufferAsync(Jimp.MIME_PNG),
        mediaType: 'image/png',
      };
    }

    image.quality(JPEG_QUALITY);
    return {
      buffer: await image.getBufferAsync(Jimp.MIME_JPEG),
      mediaType: 'image/jpeg',
    };
  } catch (err) {
    console.warn('[vision] image preprocessing failed, using original:', err.message);
    return { buffer, mediaType };
  }
}

// ── Retry helpers ──────────────────────────────────────────────────────────
function isTransientError(err) {
  const m = err?.message || '';
  if (/quota|exceeded your current/i.test(m)) return false;
  return /\b(500|502|503|504)\b/.test(m) || /overloaded|high demand|unavailable/i.test(m);
}

function isQuotaError(err) {
  return err?.message?.includes('429') || err?.message?.includes('quota') || err?.status === 429;
}

async function generateWithRetry(model, parts, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await model.generateContent(parts);
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || i === attempts - 1) throw err;
      const wait = 2_000 * 2 ** i; // 2s, 4s, 8s
      console.warn(`[vision] Gemini transient error (attempt ${i + 1}/${attempts}), retrying in ${wait / 1000}s: ${err.message.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function safeJsonParse(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

// ── Two-step extraction with Google Search grounding ──────────────────────
async function extractWithSearch(processedBuffer, mediaType, lensContext = null) {
  const imagePayload = { inlineData: { data: processedBuffer.toString('base64'), mimeType: mediaType } };

  const lensBlock = lensContext
    ? `## Contexte Google Lens (recherche par image)\n${lensContext}\n`
    : '';

  // Step 1 — ask Gemini to identify the part and search the web if useful.
  const searchModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }],
  });

  const searchResult = await generateWithRetry(searchModel, [
    imagePayload,
    `${lensBlock}Identify this automotive part precisely. Use Google search ONLY if you can find a high-confidence match (exact OEM reference visible in the image, consistent seller listings with the same reference, or clear visual match). If results are ambiguous, generic, or contradictory, say explicitly that the make/model is uncertain. Be concise.`,
  ]);

  const webContext = searchResult.response.text();
  const chunks = searchResult.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.map((c) => c.web?.title).filter(Boolean).slice(0, 5);

  if (sources.length) {
    console.log(`[vision] search grounding used ${sources.length} web source(s)`);
  } else {
    console.log('[vision] search grounding returned no web sources');
  }

  // Step 2 — structured JSON extraction using both the image and web context.
  const extractModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_WITH_CONTEXT,
    generationConfig: EXTRACTION_SCHEMA,
  });

  const contextParts = [];
  if (lensContext) contextParts.push(`## Contexte Google Lens (recherche par image)\n${lensContext}`);
  if (sources.length) contextParts.push(`## Contexte web (recherche Google)\n${webContext}\n\nSources : ${sources.join(', ')}`);
  const contextBlock = contextParts.length
    ? contextParts.join('\n\n')
    : '## Contexte web\nAucune source web fiable trouvée pour cette image.';

  const result = await generateWithRetry(extractModel, [
    imagePayload,
    `${contextBlock}\n\n## Tâche\nAnalyse l'image en tenant compte du contexte ci-dessus et remplis le schéma JSON.\n- Fais ta MEILLEURE DÉDUCTION pour marqueVehicule, typeVehicule et anneeFabrication. Utilise le contexte web et/ou la forme. Ne laisse vide que si vraiment aucun indice n'existe.\n- Ne remplis reference que si un numéro est réellement lisible sur la pièce.\n- Attribue une confiance basse (0.3–0.5) quand tu déduis sans preuve visuelle directe.`,
  ]);

  return safeJsonParse(result.response.text());
}

// ── Single-step extraction (fallback, no search) ───────────────────────────
async function extractDirect(processedBuffer, mediaType, lensContext = null) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_NO_CONTEXT,
    generationConfig: EXTRACTION_SCHEMA,
  });

  const lensBlock = lensContext
    ? `## Contexte Google Lens (recherche par image)\n${lensContext}\n`
    : '';

  const result = await generateWithRetry(model, [
    { inlineData: { data: processedBuffer.toString('base64'), mimeType: mediaType } },
    `${lensBlock}Analyse cette pièce automobile. Lis d'abord tout texte/logo visible, relève les indices de forme, puis identifie au mieux la pièce et le véhicule selon le schéma imposé.`,
  ]);

  return safeJsonParse(result.response.text());
}

/**
 * RF2–RF5 : extract structured part data from an image.
 * Tries gemini-2.5-flash + Google Search grounding first; falls back to gemini-2.5-flash without search.
 *
 * @param {Buffer} buffer
 * @param {string} mediaType
 */
export async function visionExtract(buffer, mediaType) {
  const { buffer: processed, mediaType: finalMediaType } = await preprocessImage(buffer, mediaType);

  // Step 0 — optional third-party Google Lens search (true image-based search)
  let lensContext = null;
  try {
    lensContext = await lensSearch(processed, finalMediaType);
    if (lensContext) console.log('[vision] Google Lens context found');
    else console.log('[vision] no Google Lens context');
  } catch (err) {
    console.warn('[vision] Google Lens error:', err.message);
  }

  let data;
  try {
    data = await extractWithSearch(processed, finalMediaType, lensContext);
    console.log('[vision] gemini-2.5-flash + Google Search grounding');
  } catch (err) {
    // Fall back on quota, network/fetch failures, or any model-specific error.
    console.warn(`[vision] gemini-2.5-flash + search failed (${err.message.slice(0, 120)}), falling back to gemini-2.5-flash`);
    data = await extractDirect(processed, finalMediaType, lensContext);
  }

  delete data.texteVisible;
  delete data.indices;

  if (!data.reference)         data.reference         = undefined;
  if (!data.anneeFabrication)  data.anneeFabrication  = undefined;

  return data;
}
