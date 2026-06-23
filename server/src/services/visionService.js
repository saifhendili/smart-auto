import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Model config ───────────────────────────────────────────────────────────
// Primary  : gemini-2.0-flash + Google Search grounding (best quality, 15 RPM free)
// Fallback : gemini-2.5-flash  without search          (if 2.0 unavailable in region)
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
On te fournit une image d'une pièce ET un contexte web (résultat d'une recherche Google).
Utilise les deux sources pour extraire les informations les plus précises possibles.
Priorité au contexte web pour la référence, la marque et le modèle exact.
N'invente JAMAIS une référence ; laisse vide si absente de l'image et du contexte.`;

const SYSTEM_NO_CONTEXT = `Tu es un expert en pièces détachées automobiles et en identification de véhicules.
À partir d'une image, tu identifies la pièce et tu extrais le MAXIMUM d'informations fiables.
1. LIS tout texte visible : références OEM, codes de moulage, logos de marque.
2. OBSERVE la forme, les fixations, les connecteurs pour déduire marque/modèle/année.
3. DÉDUIS les champs structurés à partir de ces observations.
N'invente JAMAIS une référence ; laisse vide si illisible.`;

function isQuotaError(err) {
  return err?.message?.includes('429') || err?.message?.includes('quota') || err?.status === 429;
}

// ── Two-step extraction with Google Search grounding ──────────────────────
async function extractWithSearch(buffer, mediaType) {
  const imagePayload = { inlineData: { data: buffer.toString('base64'), mimeType: mediaType } };

  // Step 1 — Google Lens-style search identification
  const searchModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const searchResult = await searchModel.generateContent([
    imagePayload,
    `Identify this automotive part precisely using web search. Find:
- Exact part name and OEM reference number
- Vehicle brand, model, and compatible years
- Any visible markings, codes, or logos`,
  ]);

  const webContext = searchResult.response.text();
  const chunks = searchResult.response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.map((c) => c.web?.title).filter(Boolean).slice(0, 5).join(', ');

  // Step 2 — Structured JSON extraction with web context
  const extractModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_WITH_CONTEXT,
    generationConfig: EXTRACTION_SCHEMA,
  });

  const result = await extractModel.generateContent([
    imagePayload,
    `## Web search context\n${webContext}${sources ? `\nSources: ${sources}` : ''}\n\n## Task\nFill in the JSON schema using both the image and the web context.`,
  ]);

  return JSON.parse(result.response.text());
}

// ── Single-step extraction (fallback, no search) ───────────────────────────
async function extractDirect(buffer, mediaType) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_NO_CONTEXT,
    generationConfig: EXTRACTION_SCHEMA,
  });

  const result = await model.generateContent([
    { inlineData: { data: buffer.toString('base64'), mimeType: mediaType } },
    "Analyse cette pièce automobile. Lis d'abord tout texte/logo visible, relève les indices de forme, puis identifie au mieux la pièce et le véhicule selon le schéma imposé.",
  ]);

  return JSON.parse(result.response.text());
}

/**
 * RF2–RF5 : extract structured part data from an image.
 * Tries gemini-2.0-flash + Google Search first; falls back to gemini-2.5-flash on quota error.
 */
export async function visionExtract(buffer, mediaType) {
  let data;

  try {
    data = await extractWithSearch(buffer, mediaType);
    console.log('[vision] gemini-2.0-flash + search grounding');
  } catch (err) {
    if (isQuotaError(err)) {
      console.warn('[vision] gemini-2.0-flash unavailable, falling back to gemini-2.5-flash');
      data = await extractDirect(buffer, mediaType);
    } else {
      throw err;
    }
  }

  delete data.texteVisible;
  delete data.indices;

  if (!data.reference)         data.reference         = undefined;
  if (!data.anneeFabrication)  data.anneeFabrication  = undefined;

  return data;
}
