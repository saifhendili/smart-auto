// RF8 niveau 3 — normalisation du texte pour la déduplication par caractéristiques.
//
// L'IA décrit la MÊME pièce avec des libellés différents d'une photo à l'autre :
//   « Mercedes-Benz GLC-Class (X253) », « Mercedes-Benz Voiture de tourisme »,
//   « Véhicule non précisé »…
// Une comparaison stricte (===) échoue donc et crée des doublons. On normalise
// d'abord le texte, et on traite les libellés « vides de sens » comme des
// JOKERS (wildcards) qui matchent n'importe quelle valeur.

// Phrases génériques sans valeur distinctive, retirées même quand elles sont
// noyées dans un libellé (« Mercedes-Benz Voiture de tourisme » → « mercedes-benz »).
const NOISE_PHRASES = [
  'vehicule non precise',
  'voiture de tourisme',
  'voiture particuliere',
  'non precise',
  'inconnu',
  'n/a',
];

/** minuscule + sans accents + espaces normalisés. */
function basic(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalise un nom de pièce. Ex: « Pare-chocs avant » → « pare chocs avant ». */
export function normNom(str = '') {
  return basic(str).replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normalise un libellé véhicule (marque ou type).
 * Retire les codes de plateforme entre parenthèses « (X253) », et renvoie ''
 * (= joker) pour les libellés génériques sans valeur distinctive.
 */
export function normVehicule(str = '') {
  let v = basic(str).replace(/\([^)]*\)/g, ' '); // retire « (X253) »
  for (const phrase of NOISE_PHRASES) v = v.split(phrase).join(' ');
  return v.replace(/\s+/g, ' ').trim(); // '' = joker
}

/**
 * Deux libellés véhicule sont « compatibles » s'ils sont égaux, OU si l'un est un
 * joker (vide), OU si l'un est contenu dans l'autre (« mercedes-benz » ⊂
 * « mercedes-benz glc-class »).
 */
export function vehiculeCompatible(a = '', b = '') {
  if (!a || !b) return true; // un joker matche tout
  return a === b || a.includes(b) || b.includes(a);
}
