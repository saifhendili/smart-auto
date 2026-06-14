import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Piece from '../models/Piece.js';
import { sha256 } from '../utils/hash.js';
import { dHash, hammingDistance, PHASH_THRESHOLD } from '../utils/perceptualHash.js';
import { normNom, normVehicule, vehiculeCompatible } from '../utils/normalize.js';
import { visionExtract } from '../services/visionService.js';

/**
 * RF8 niveau 1bis — cherche en base une pièce dont l'image est perceptuellement
 * proche (distance de Hamming ≤ seuil). Renvoie { piece, distance } ou null.
 */
async function findByPerceptualHash(phash) {
  // À l'échelle du projet, on compare en mémoire ; pour passer à l'échelle,
  // remplacer par un index spécialisé (ex: BK-tree ou MongoDB Atlas Vector Search).
  const candidates = await Piece.find({ phash: { $exists: true, $ne: null } });
  let best = null;
  for (const c of candidates) {
    const distance = hammingDistance(phash, c.phash);
    if (distance <= PHASH_THRESHOLD && (!best || distance < best.distance)) {
      best = { piece: c, distance };
    }
  }
  return best;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// UPLOAD_DIR configurable (l'app Electron pointe vers un dossier inscriptible : userData)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

// Écrit l'image sur le disque et renvoie son URL publique
async function persistImage(buffer, mimetype) {
  const ext = (mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true }); // s'assure que le dossier existe
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);
  const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/uploads/${filename}`;
}

/**
 * POST /api/pieces/analyze
 * RF1–RF10 : upload → déduplication multi-niveaux → analyse IA → vérification réf. → notification.
 */
export async function analyzePiece(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucune image fournie (champ "image").' });
    const { buffer, mimetype } = req.file;

    // RF8 - Niveau 1 : déduplication par image (AVANT tout upload disque / appel IA)
    const imageHash = sha256(buffer);
    let piece = await Piece.findOne({ imageHash });
    if (piece) {
      return res.json({
        verification: {
          exists: true,
          by: 'image',
          message: `Pièce déjà connue (image identique) : « ${piece.nom} »${
            piece.reference ? `, réf. ${piece.reference}` : ''
          }.`,
        },
        source: 'image-cache',
        piece,
      });
    }

    // RF8 - Niveau 1bis : déduplication par image PERCEPTUELLE (quasi-doublon).
    // Détecte la même image redimensionnée / re-compressée / légèrement recadrée,
    // que le SHA-256 ci-dessus laisse passer. Fait AVANT l'IA pour économiser le quota.
    const phash = await dHash(buffer);
    const near = await findByPerceptualHash(phash);
    if (near) {
      return res.json({
        verification: {
          exists: true,
          by: 'image-similarity',
          message: `Image quasi identique à une pièce existante : « ${near.piece.nom} »${
            near.piece.reference ? `, réf. ${near.piece.reference}` : ''
          } (distance ${near.distance}/64).`,
        },
        source: 'phash-cache',
        piece: near.piece,
      });
    }

    // RF2–RF5 : le MODÈLE analyse d'abord et extrait les infos (dont la référence)
    const data = await visionExtract(buffer, mimetype);

    // RF10 : on vérifie ENSUITE la référence extraite en base et on NOTIFIE l'utilisateur
    if (data.reference) {
      piece = await Piece.findOne({ reference: data.reference });
      if (piece) {
        return res.json({
          verification: {
            exists: true,
            by: 'reference',
            message: `La référence ${data.reference} existe déjà en base : « ${piece.nom} ».`,
          },
          source: 'ref-cache',
          piece,
        });
      }
    }

    // RF8 - Niveau 3 : déduplication par caractéristiques NORMALISÉES (même pièce,
    // image + réf. différentes). On compare le nom normalisé, puis on vérifie que
    // marque et type sont COMPATIBLES (égaux, ou l'un est un joker « non précisé »).
    const nomNorm = normNom(data.nom);
    const marqueNorm = normVehicule(data.marqueVehicule);
    const typeNorm = normVehicule(data.typeVehicule);

    const sameName = await Piece.find({ nomNorm });
    piece = sameName.find(
      (p) =>
        vehiculeCompatible(marqueNorm, p.marqueNorm) &&
        vehiculeCompatible(typeNorm, p.typeNorm)
    );
    if (piece) {
      return res.json({
        verification: {
          exists: true,
          by: 'characteristics',
          message: `Une pièce similaire existe déjà${
            piece.reference ? ` (réf. ${piece.reference})` : ''
          } : « ${piece.nom} ».`,
        },
        source: 'feature-cache',
        piece,
      });
    }

    // RF7 : nouvelle pièce → on enregistre (image + données + empreintes) et on le signale
    const imageUrl = await persistImage(buffer, mimetype);
    piece = await Piece.create({
      ...data,
      imageUrl,
      imageHash,
      phash,
      nomNorm,
      marqueNorm,
      typeNorm,
      source: 'ai',
    });

    return res.status(201).json({
      verification: {
        exists: false,
        by: null,
        message: data.reference
          ? `Nouvelle pièce. Référence ${data.reference} enregistrée en base.`
          : 'Nouvelle pièce enregistrée en base.',
      },
      source: 'ai',
      piece,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/pieces/check-image
 * RF8 niveau 1 : vérifie via le hash si l'image existe déjà, SANS upload ni analyse.
 */
export async function checkImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucune image fournie (champ "image").' });
    const imageHash = sha256(req.file.buffer);
    const piece = await Piece.findOne({ imageHash });
    return res.json({ exists: Boolean(piece), piece: piece || null });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/pieces — RF9 : consulter toutes les données enregistrées (pagination + filtres).
 */
export async function listPieces(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 12);
    const { marque, type, categorie, couleur, q } = req.query;

    const filter = {};
    if (marque) filter.marqueVehicule = new RegExp(marque, 'i');
    if (type) filter.typeVehicule = new RegExp(type, 'i');
    if (categorie) filter.categorie = new RegExp(categorie, 'i');
    if (couleur) filter.couleur = new RegExp(couleur, 'i');
    if (q) filter.$or = [{ nom: new RegExp(q, 'i') }, { reference: new RegExp(q, 'i') }];

    const [items, total] = await Promise.all([
      Piece.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Piece.countDocuments(filter),
    ]);

    return res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pieces/filters — valeurs distinctes pour les filtres du catalogue. */
export async function getFilters(req, res, next) {
  try {
    const [categories, couleurs] = await Promise.all([
      Piece.distinct('categorie').then((v) => v.filter(Boolean).sort()),
      Piece.distinct('couleur').then((v) => v.filter(Boolean).sort()),
    ]);
    return res.json({ categories, couleurs });
  } catch (err) {
    next(err);
  }
}

/** GET /api/pieces/:id — RF9 : fiche détaillée. */
export async function getPiece(req, res, next) {
  try {
    const piece = await Piece.findById(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable.' });
    return res.json(piece);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/pieces/:id — édition manuelle d'une pièce (corrige les infos extraites par l'IA).
 * Recalcule les empreintes normalisées (RF8 niveau 3) si le nom/marque/type changent.
 */
export async function updatePiece(req, res, next) {
  try {
    const set = {};
    const unset = {};
    const b = req.body;

    if ('nom' in b) {
      set.nom = b.nom;
      set.nomNorm = normNom(b.nom);
    }
    if ('marqueVehicule' in b) {
      set.marqueVehicule = b.marqueVehicule;
      set.marqueNorm = normVehicule(b.marqueVehicule);
    }
    if ('typeVehicule' in b) {
      set.typeVehicule = b.typeVehicule;
      set.typeNorm = normVehicule(b.typeVehicule);
    }
    if ('categorie' in b) set.categorie = b.categorie;
    if ('couleur' in b) set.couleur = b.couleur;
    if ('description' in b) set.description = b.description;
    if ('emplacement' in b) set.emplacement = b.emplacement;
    // Référence/année vides → on les retire (évite de violer l'unicité sparse)
    if ('reference' in b) (b.reference ? (set.reference = b.reference) : (unset.reference = ''));
    if ('anneeFabrication' in b)
      Number(b.anneeFabrication) ? (set.anneeFabrication = Number(b.anneeFabrication)) : (unset.anneeFabrication = '');

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;

    const piece = await Piece.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable.' });
    return res.json(piece);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: `La référence « ${req.body.reference} » existe déjà sur une autre pièce.` });
    }
    next(err);
  }
}

/** DELETE /api/pieces/:id — suppression (admin). */
export async function deletePiece(req, res, next) {
  try {
    const piece = await Piece.findByIdAndDelete(req.params.id);
    if (!piece) return res.status(404).json({ message: 'Pièce introuvable.' });
    return res.json({ message: 'Pièce supprimée.' });
  } catch (err) {
    next(err);
  }
}
