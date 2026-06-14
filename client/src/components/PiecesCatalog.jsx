import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPieces } from '../services/api.js';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// RF9 : consulter toutes les données enregistrées (catalogue + recherche)
export default function PiecesCatalog() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPieces({ q, page, limit: 12 })
      .then((res) => active && setData(res))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [q, page]);

  return (
    <section>
      <div className="catalog-head">
        <h2 className="section-title">
          Catalogue des pièces <span className="count-pill">{data.total}</span>
        </h2>
        <div className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Rechercher par nom ou référence…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="skeleton-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton card" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m3 15 5-4 4 3 3-2 6 4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <circle cx="8" cy="9.5" r="1.4" fill="currentColor" />
            </svg>
          </div>
          <h3>Aucune pièce enregistrée</h3>
          <p className="muted">
            Analysez une première image depuis l’onglet <Link to="/">Analyser</Link>.
          </p>
        </div>
      ) : (
        <div className="grid">
          {data.items.map((p) => (
            <Link to={`/pieces/${p._id}`} key={p._id} className="grid-card">
              <div className="thumb">
                <img src={p.imageUrl} alt={p.nom} loading="lazy" />
              </div>
              <div className="meta">
                <strong>{p.nom}</strong>
                <span>
                  {[p.marqueVehicule, p.typeVehicule].filter(Boolean).join(' ') || 'Véhicule non précisé'}
                </span>
                {p.reference && <span className="chip">Réf. {p.reference}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {data.pages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Précédent
          </button>
          <span>
            Page {data.page} sur {data.pages}
          </span>
          <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Suivant →
          </button>
        </div>
      )}
    </section>
  );
}
