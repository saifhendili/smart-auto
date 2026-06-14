import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPieces, fetchFilters } from '../services/api.js';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// RF9 : consulter toutes les données enregistrées (catalogue + recherche + filtres)
export default function PiecesCatalog() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ categories: [], couleurs: [] });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [couleur, setCouleur] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilters().then(setFilters).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { page, limit: 20 };
    if (q) params.q = q;
    if (category) params.categorie = category;
    if (couleur) params.couleur = couleur;
    fetchPieces(params)
      .then((res) => active && setData(res))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [q, category, couleur, page]);

  const hasFilters = q || category || couleur;

  function clearFilters() {
    setQ('');
    setCategory('');
    setCouleur('');
    setPage(1);
  }

  return (
    <section>
      {/* ── Header ── */}
      <div className="catalog-head">
        <h2 className="section-title">
          Parts Catalog <span className="count-pill">{data.total}</span>
        </h2>
        <div className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search by name or reference…"
            value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }}
          />
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <span className="filter-label">
          <FilterIcon /> Filters
        </span>

        <select
          className="filter-select"
          value={category}
          onChange={(e) => { setPage(1); setCategory(e.target.value); }}
        >
          <option value="">All categories</option>
          {filters.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={couleur}
          onChange={(e) => { setPage(1); setCouleur(e.target.value); }}
        >
          <option value="">All colors</option>
          {filters.couleurs.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="btn btn-ghost filter-clear" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="list-view">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton list-skeleton" />
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
          <h3>{hasFilters ? 'No parts match your filters' : 'No parts recorded yet'}</h3>
          <p className="muted">
            {hasFilters ? (
              <button className="btn-link" onClick={clearFilters}>Clear filters</button>
            ) : (
              <>Analyze an image from the <Link to="/">Analyze</Link> tab.</>
            )}
          </p>
        </div>
      ) : (
        <div className="list-view">
          {data.items.map((p) => (
            <Link to={`/pieces/${p._id}`} key={p._id} className="list-row">
              <div className="list-thumb">
                <img src={p.imageUrl} alt={p.nom} loading="lazy" />
              </div>

              <div className="list-info">
                <strong className="list-name">{p.nom}</strong>
                <span className="list-sub">
                  {[p.marqueVehicule, p.typeVehicule].filter(Boolean).join(' · ') || 'Vehicle unspecified'}
                </span>
              </div>

              <div className="list-meta">
                {p.categorie && <span className="chip chip-cat">{p.categorie}</span>}
                {p.reference && <span className="chip">Ref. {p.reference}</span>}
                {p.couleur && <span className="chip chip-color">{p.couleur}</span>}
                {p.anneeFabrication > 0 && (
                  <span className="list-year">{p.anneeFabrication}</span>
                )}
              </div>

              <span className="list-arrow">
                <ChevronRight />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {data.pages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <span>Page {data.page} of {data.pages}</span>
          <button className="btn btn-ghost" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
