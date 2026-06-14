import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// RF1 + RF8 + RF10 : envoie l'image, reçoit { verification, source, piece }
export async function analyzePiece(file) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post('/pieces/analyze', form);
  return data;
}

// RF8 niveau 1 : pré-vérification par hash, sans analyse
export async function checkImage(file) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post('/pieces/check-image', form);
  return data;
}

// RF9 : consulter toutes les données enregistrées
export async function fetchPieces(params = {}) {
  const { data } = await api.get('/pieces', { params });
  return data;
}

export async function fetchPiece(id) {
  const { data } = await api.get(`/pieces/${id}`);
  return data;
}

// Édition manuelle d'une pièce (corrige les infos extraites par l'IA)
export async function updatePiece(id, fields) {
  const { data } = await api.patch(`/pieces/${id}`, fields);
  return data;
}

// Suppression d'une pièce
export async function deletePiece(id) {
  const { data } = await api.delete(`/pieces/${id}`);
  return data;
}

export default api;
