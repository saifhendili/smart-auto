import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemini renvoie du JSON strict grâce à responseMimeType + responseSchema
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash', // niveau gratuit (Google AI Studio)
  systemInstruction: `Tu es un expert en pièces détachées automobiles et en identification de véhicules.
À partir d'une image, tu identifies la pièce et tu extrais le MAXIMUM d'informations fiables.

MÉTHODE (à suivre dans l'ordre) :
1. LIS tout texte visible sur la pièce : références OEM, numéros de moulage gravés,
   codes-barres, étiquettes, tampons, logos de marque (Bosch, Valeo, Hella, Mercedes…).
   Reporte-les dans "texteVisible".
2. OBSERVE la forme, les fixations, les connecteurs, le style de conception : ces indices
   permettent souvent de déduire la marque/le modèle du véhicule. Note-les dans "indices".
3. DÉDUIS ensuite les champs structurés à partir de ces observations.

RÈGLES :
- Tu PEUX faire une déduction raisonnable pour la marque, le type/modèle et l'année quand
  la forme, les fixations ou les logos le permettent — donne ta meilleure estimation plutôt
  que de laisser vide, et baisse "confiance" en conséquence.
- Pour l'ANNÉE : si tu identifies le modèle, estime une année plausible de sa période de
  production. Mets 0 seulement si vraiment indéterminable.
- Pour la RÉFÉRENCE : ne reporte QUE ce qui est réellement lisible sur la pièce. N'invente
  JAMAIS une référence ; laisse vide si aucun code n'est lisible.
- N'invente pas de texte dans "texteVisible" : uniquement ce qui est réellement écrit.`,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        // Champs de raisonnement (scratchpad) — remplis EN PREMIER, non affichés à l'utilisateur.
        texteVisible: {
          type: 'string',
          description:
            'Tout texte/numéro/logo réellement lisible sur la pièce (références, codes de moulage, étiquettes…). Vide si aucun.',
        },
        indices: {
          type: 'string',
          description:
            'Indices visuels (forme, fixations, connecteurs, style) utilisés pour déduire marque/modèle/année.',
        },
        // Champs structurés finaux
        nom: { type: 'string', description: 'Nom de la pièce automobile' },
        categorie: {
          type: 'string',
          description:
            "Catégorie de la pièce parmi : Moteur, Transmission, Freinage, Suspension, Direction, Électrique, Carrosserie, Intérieur, Climatisation, Échappement, Alimentation, Refroidissement, Autre",
        },
        marqueVehicule: {
          type: 'string',
          description: 'Marque du véhicule (meilleure estimation déduite si non écrite ; vide si indéterminable)',
        },
        typeVehicule: {
          type: 'string',
          description: 'Type / modèle du véhicule (meilleure estimation déduite ; vide si indéterminable)',
        },
        reference: {
          type: 'string',
          description: 'Référence RÉELLEMENT lisible sur la pièce (vide si illisible — ne jamais inventer)',
        },
        anneeFabrication: {
          type: 'integer',
          description: "Année estimée d'après la période de production du modèle (0 si indéterminable)",
        },
        couleur: { type: 'string', description: 'Couleur de la pièce (vide si indéterminable)' },
        description: { type: 'string', description: 'Description automatique de la pièce' },
        emplacement: { type: 'string', description: 'Emplacement de la pièce dans le véhicule' },
        confiance: {
          type: 'number',
          description: 'Score de confiance global entre 0 et 1 (plus bas si déduction incertaine)',
        },
      },
      required: [
        'texteVisible',
        'indices',
        'nom',
        'categorie',
        'marqueVehicule',
        'typeVehicule',
        'reference',
        'anneeFabrication',
        'couleur',
        'description',
        'emplacement',
        'confiance',
      ],
    },
  },
});

/**
 * RF2–RF5 : applique le modèle de vision (Gemini) et retourne les infos structurées.
 * @param {Buffer} buffer  octets de l'image
 * @param {string} mediaType  ex: "image/jpeg"
 * @returns {Promise<object>} { nom, marqueVehicule, typeVehicule, reference, anneeFabrication, description, emplacement, confiance }
 */
export async function visionExtract(buffer, mediaType) {
  const result = await model.generateContent([
    { inlineData: { data: buffer.toString('base64'), mimeType: mediaType } },
    "Analyse cette pièce automobile. Lis d'abord tout texte/logo visible, relève les indices de forme, puis identifie au mieux la pièce et le véhicule selon le schéma imposé.",
  ]);

  const data = JSON.parse(result.response.text());

  // Les champs de raisonnement ne sont pas persistés (scratchpad interne au modèle).
  delete data.texteVisible;
  delete data.indices;

  // Normalisation : référence/année vides → undefined (pour ne pas violer l'unicité)
  if (!data.reference) data.reference = undefined;
  if (!data.anneeFabrication) data.anneeFabrication = undefined;
  return data;
}
