import Jimp from 'jimp';

// RF8 niveau 1bis — empreinte PERCEPTUELLE (dHash) de l'image.
//
// Contrairement au SHA-256 (utils/hash.js) qui change totalement dès qu'un seul
// octet diffère, le dHash reste STABLE quand l'image est redimensionnée,
// re-compressée ou légèrement recadrée. On peut donc mesurer une « distance »
// entre deux images et détecter les quasi-doublons.

/**
 * Calcule le dHash 64 bits d'une image et le renvoie en hexadécimal (16 caractères).
 *
 * Principe : on réduit l'image en 9×8 niveaux de gris, puis pour chaque pixel on
 * note si son voisin de droite est plus clair (1) ou plus sombre (0). 8 comparaisons
 * par ligne × 8 lignes = 64 bits.
 *
 * @param {Buffer} buffer  octets de l'image
 * @returns {Promise<string>} empreinte perceptuelle hexadécimale (ex: "f0c0...")
 */
export async function dHash(buffer) {
  const image = await Jimp.read(buffer);
  image.resize(9, 8).greyscale();

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
      const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
      bits += left > right ? '1' : '0';
    }
  }

  // 64 bits binaires → 16 caractères hexadécimaux
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT = Array.from({ length: 16 }, (_, n) =>
  n.toString(2).split('').filter((b) => b === '1').length
);

/**
 * Distance de Hamming entre deux empreintes hexadécimales (nombre de bits différents).
 * 0 = images perceptuellement identiques ; plus le nombre est grand, plus elles diffèrent.
 *
 * @param {string} a empreinte hex
 * @param {string} b empreinte hex
 * @returns {number} distance (0–64), ou Infinity si une empreinte est absente
 */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += POPCOUNT[xor];
  }
  return dist;
}

// Seuil par défaut : ≤ 10 bits de différence (sur 64) ⇒ on considère que c'est
// la même image (re-sauvegardée, redimensionnée, légèrement recadrée). Réglable.
export const PHASH_THRESHOLD = Number(process.env.PHASH_THRESHOLD || 10);
