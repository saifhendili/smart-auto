import { useEffect, useState } from 'react';
import { updatePiece, deletePiece } from '../services/api.js';

// RF3–RF5 : fiche d'informations d'une pièce (consultation + édition + suppression)
const SOURCE_LABEL = {
  ai: 'Extrait par IA',
  'image-cache': 'Reconnu (image)',
  'phash-cache': 'Reconnu (image similaire)',
  'ref-cache': 'Reconnu (référence)',
  'feature-cache': 'Reconnu (caractéristiques)',
};

// Champs éditables : [clé, libellé, type]
const FIELDS = [
  ['nom', 'Nom de la pièce', 'text'],
  ['marqueVehicule', 'Marque du véhicule', 'text'],
  ['typeVehicule', 'Type du véhicule', 'text'],
  ['reference', 'Référence', 'text'],
  ['anneeFabrication', 'Année de fabrication', 'number'],
  ['emplacement', 'Emplacement', 'text'],
];

export default function PieceResult({ piece: initial, allowDelete = false, onUpdated, onDeleted }) {
  const [piece, setPiece] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-synchronise si le parent fournit une autre pièce (ex: nouvelle analyse)
  useEffect(() => {
    setPiece(initial);
    setEditing(false);
    setError(null);
  }, [initial?._id]);

  if (!piece) return null;

  function startEdit() {
    setForm({
      nom: piece.nom || '',
      marqueVehicule: piece.marqueVehicule || '',
      typeVehicule: piece.typeVehicule || '',
      reference: piece.reference || '',
      anneeFabrication: piece.anneeFabrication || '',
      emplacement: piece.emplacement || '',
      description: piece.description || '',
    });
    setError(null);
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updatePiece(piece._id, form);
      setPiece(updated);
      setEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de l’enregistrement.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${piece.nom} » ?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deletePiece(piece._id);
      onDeleted?.(piece._id);
    } catch (err) {
      setError(err.response?.data?.message || 'Échec de la suppression.');
      setBusy(false);
    }
  }

  const specs = [
    ['Marque du véhicule', piece.marqueVehicule],
    ['Type du véhicule', piece.typeVehicule],
    ['Référence', piece.reference],
    ['Année de fabrication', piece.anneeFabrication],
    ['Emplacement', piece.emplacement],
  ];

  return (
    <article className="panel piece-card">
      <div className="piece-media">
        {piece.imageUrl ? (
          <img src={piece.imageUrl} alt={piece.nom} />
        ) : (
          <span className="muted">Pas d’image</span>
        )}
      </div>

      <div className="piece-body">
        <div className="piece-head">
          <h3>{editing ? 'Modifier la pièce' : piece.nom}</h3>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {piece.source && <span className="badge badge-slate">{SOURCE_LABEL[piece.source] || piece.source}</span>}
            {typeof piece.confiance === 'number' && (
              <span className="badge badge-amber">Confiance {Math.round(piece.confiance * 100)}%</span>
            )}
          </div>
        </div>

        {error && (
          <div className="notif notif-error" style={{ marginBottom: '0.75rem' }}>
            <span className="notif-ico">!</span>
            <p>{error}</p>
          </div>
        )}

        {editing ? (
          <form className="edit-form" onSubmit={save}>
            <div className="edit-grid">
              {FIELDS.map(([key, label, type]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <label className="field">
              <span>Description</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <div className="piece-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy && <span className="spinner" />}
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="specs">
              {specs.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || <span className="muted">—</span>}</dd>
                </div>
              ))}
            </dl>

            {piece.description && (
              <div className="desc-block">
                <h4>Description</h4>
                <p>{piece.description}</p>
              </div>
            )}

            <div className="piece-actions">
              <button type="button" className="btn btn-ghost" onClick={startEdit}>
                ✎ Éditer
              </button>
              {allowDelete && (
                <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
                  🗑 Supprimer
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
