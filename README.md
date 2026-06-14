# Smart Auto — Application MERN

Plateforme IA d'analyse de pièces automobiles : on importe une image, l'IA extrait les
informations de la pièce, vérifie si elle existe déjà en base et notifie l'utilisateur.
Le catalogue permet de consulter toutes les pièces enregistrées.

Implémente le cahier des charges **Smart Auto** (RF1–RF10) — voir `../SMART_AUTO_MERN.md`.

## Stack

- **MongoDB** + Mongoose — stockage des pièces / utilisateurs
- **Express / Node.js** — API REST + orchestration IA + déduplication
- **React (Vite)** — interface (upload, résultats, catalogue), **PWA installable**
- **Google Gemini `gemini-2.5-flash`** (vision + JSON, **niveau gratuit**) — reconnaissance et extraction
- **Electron** — packaging en application desktop Windows (`.exe`), Node embarqué

## Arborescence

```
smart-auto/
├── server/        # API Express + Mongoose + service IA (Gemini)
├── client/        # React (Vite) + PWA
├── electron/      # Process principal Electron (app desktop)
├── install.bat / start.bat / start-dev.bat         # web
├── run-desktop.bat / build-desktop.bat             # app desktop (.exe)
└── package.json   # config Electron + electron-builder
```

## Prérequis

- Node.js 18+
- Une instance MongoDB (locale ou Atlas)
- Une clé API Google Gemini gratuite (`GEMINI_API_KEY`) — https://aistudio.google.com/apikey

## 🪟 Installation directe sur Windows (recommandé)

Aucune commande à taper — l'application est livrée avec des scripts qui installent
**Node.js** (via `winget`) et **toutes les dépendances** automatiquement :

1. **Double-cliquez sur `install.bat`**
   → installe Node.js si absent, puis les dépendances backend + frontend, et compile l'application.
   *(Si Node vient d'être installé : fermez la fenêtre, rouvrez-en une, relancez `install.bat`.)*
2. Ouvrez `server\.env` et renseignez `MONGO_URI` et `GEMINI_API_KEY`.
3. **Double-cliquez sur `start.bat`**
   → lance le serveur et ouvre `http://localhost:5000` dans le navigateur.

## 🖥️ Application desktop (.exe Electron)

Pour une **vraie application Windows** (fenêtre native, Node embarqué, **aucun navigateur
ni installation de Node requis** chez l'utilisateur final) :

| Script | Rôle |
|--------|------|
| `run-desktop.bat` | **Test rapide** : compile l'UI et ouvre l'app dans une fenêtre Electron |
| `build-desktop.bat` | **Crée l'installateur** `dist\Smart Auto Setup <version>.exe` |

Étapes pour produire l'installateur distribuable :

1. `install.bat` (une fois) — Node + dépendances
2. Renseignez `server\.env` (`MONGO_URI`, `GEMINI_API_KEY`)
3. **Double-cliquez sur `build-desktop.bat`**
   → génère `dist\Smart Auto Setup 1.0.0.exe`
4. Cet `.exe` s'installe comme n'importe quel logiciel Windows (raccourci bureau + menu Démarrer).

> L'app embarque le serveur Node + l'UI ; au lancement elle démarre le serveur en interne et
> affiche l'interface dans une fenêtre native. La config (MongoDB, Gemini) est lue depuis le
> `server\.env` embarqué. Les images uploadées sont stockées dans `%APPDATA%\Smart Auto\uploads`.

---

### 📱 Installer comme application (PWA)

Une fois `http://localhost:5000` ouvert dans **Chrome / Edge** :
- Cliquez sur l'icône **« Installer »** dans la barre d'adresse (ou menu ⋮ → *Installer Smart Auto*).
- L'application s'ajoute avec son icône (bureau Windows / écran d'accueil mobile) et s'ouvre
  en plein écran, comme une vraie application.

> Sur Windows, l'installation PWA fonctionne directement sur `localhost`.
> Pour l'installer depuis un **téléphone**, il faut servir l'app en HTTPS (ex. via `ngrok`)
> et définir `PUBLIC_URL` sur l'URL publique.

---

## Démarrage manuel (Linux / macOS, ou développement)

### Production (un seul serveur)

```bash
cd client && npm install && npm run build   # compile l'app + la PWA
cd ../server && npm install
cp .env.example .env                         # renseigner MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm start                                    # http://localhost:5000 (sert l'app + l'API)
```

Le serveur Express sert automatiquement `client/dist` s'il existe → application installable
servie sur le même port que l'API.

### Développement (rechargement à chaud)

```bash
cd server && npm run dev      # http://localhost:5000
cd client && npm run dev      # http://localhost:5173 (proxy /api + /uploads vers 5000)
```

Sur Windows, `start-dev.bat` ouvre les deux serveurs dans deux fenêtres.

## API

| Méthode | Endpoint | Description | Exigence |
|---------|----------|-------------|----------|
| `POST` | `/api/pieces/analyze` | Upload image → dédup → analyse IA → vérification réf. → notification | RF1–RF10 |
| `POST` | `/api/pieces/check-image` | Vérifie via le hash si l'image existe (sans analyse) | RF8 N1 |
| `GET` | `/api/pieces` | Catalogue paginé + recherche | RF9 |
| `GET` | `/api/pieces/:id` | Fiche détaillée | RF9 |
| `DELETE` | `/api/pieces/:id` | Suppression (admin, JWT) | — |
| `POST` | `/api/auth/register` · `/api/auth/login` | Authentification JWT | — |

## Flux d'analyse (RF1–RF10)

1. **RF8 niveau 1** — hash SHA-256 de l'image ; si l'image existe déjà → renvoi immédiat (sans IA).
2. **RF2–RF5** — le modèle de vision analyse l'image et extrait nom, marque, type, référence, année, description, emplacement.
3. **RF10** — vérification de la **référence** extraite en base ; l'utilisateur est notifié (existe / nouvelle).
4. **RF8 niveau 3** — sinon, recherche par caractéristiques (même pièce, image/réf. différentes).
5. **RF7** — sinon, enregistrement de la nouvelle pièce (image + données + empreinte).

Chaque réponse `analyze` renvoie un objet `verification { exists, by, message }` que le
frontend transforme en bandeau (vert = existe déjà, bleu = nouvelle).

## Mapping des exigences → code

| Exigence | Emplacement |
|----------|-------------|
| RF1 | `client/.../UploadForm.jsx` + `server/.../middleware/upload.js` |
| RF2–RF5 | `server/.../services/visionService.js` |
| RF7 | `server/.../controllers/pieceController.js` (`Piece.create`) |
| RF8 | `pieceController.js` (`analyzePiece`, `checkImage`) + `utils/hash.js` |
| RF9 | `client/.../PiecesCatalog.jsx` + `PieceDetail.jsx` + `GET /api/pieces` |
| RF10 | `pieceController.js` (objet `verification`) + `client/.../Notification.jsx` |
