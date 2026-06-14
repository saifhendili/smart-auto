import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import {
  analyzePiece,
  checkImage,
  listPieces,
  getFilters,
  getPiece,
  updatePiece,
  deletePiece,
} from '../controllers/pieceController.js';

const router = Router();

router.post('/analyze', upload.single('image'), analyzePiece); // RF1–RF10
router.post('/check-image', upload.single('image'), checkImage); // RF8 niveau 1
router.get('/', listPieces); // RF9
router.get('/filters', getFilters); // valeurs distinctes pour les filtres
router.get('/:id', getPiece); // RF9
router.patch('/:id', updatePiece); // édition manuelle
router.delete('/:id', deletePiece); // suppression

export default router;
