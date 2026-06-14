import mongoose from 'mongoose';

// RF3 / RF4 / RF5 / RF7 / RF8 — modèle d'une pièce automobile
const PieceSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true }, // RF3
    marqueVehicule: { type: String, trim: true }, // RF3
    typeVehicule: { type: String, trim: true }, // RF3
    reference: { type: String, trim: true, index: true, unique: true, sparse: true }, // RF3 + RF8/RF10
    anneeFabrication: { type: Number }, // RF3
    description: { type: String, trim: true }, // RF4
    emplacement: { type: String, trim: true }, // RF5
    imageUrl: { type: String, required: true }, // RF1
    imageHash: { type: String, index: true, unique: true, sparse: true }, // RF8 niveau 1 (dédup par image — octets exacts)
    phash: { type: String, index: true }, // RF8 niveau 1bis (empreinte perceptuelle — quasi-doublons d'image)
    nomNorm: { type: String, index: true }, // RF8 niveau 3 (nom normalisé pour comparaison)
    marqueNorm: { type: String }, // RF8 niveau 3 (marque normalisée)
    typeNorm: { type: String }, // RF8 niveau 3 (type normalisé)
    source: {
      type: String,
      enum: ['ai', 'image-cache', 'phash-cache', 'ref-cache', 'feature-cache'],
      default: 'ai',
    },
    confiance: { type: Number, min: 0, max: 1 }, // score de confiance IA
  },
  { timestamps: true }
);

export default mongoose.model('Piece', PieceSchema);
