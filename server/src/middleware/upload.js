import multer from 'multer';

// RF1 — réception de l'image en mémoire (on a besoin du buffer pour le hash + l'IA)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Le fichier doit être une image.'), false);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
});
