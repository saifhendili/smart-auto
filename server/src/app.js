import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import pieceRoutes from './routes/pieceRoutes.js';
import authRoutes from './routes/authRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

const app = express();

app.use(cors());
app.use(express.json());

// Images uploadées servies en statique (RF1)
app.use('/uploads', express.static(UPLOAD_DIR));

// Healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'smart-auto' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/pieces', pieceRoutes);

// Sert l'application React compilée (mode production / app installable)
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // Fallback SPA : toute route non-API renvoie index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

// 404
app.use((req, res) => res.status(404).json({ message: 'Route introuvable.' }));

// Gestionnaire d'erreurs centralisé
app.use((err, req, res, next) => {
  console.error('Erreur :', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Erreur serveur.' });
});

export default app;
