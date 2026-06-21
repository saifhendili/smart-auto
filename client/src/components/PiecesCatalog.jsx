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

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EMPTY_FILTERS = {
  categories: [], couleurs: [], marques: [], types: [], annees: [],
};

export default function PiecesCatalog() {
  const [data,    setData]    = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [opts,    setOpts]    = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  // Filter state
  const [q,        setQ]        = useState('');
  const [category, setCategory] = useState('');
  const [couleur,  setCouleur]  = useState('');
  const [marque,   setMarque]   = useState('');
  const [type,     setType]     = useState('');
  const [yearMin,  setYearMin]  = useState('');
  const [yearMax,  setYearMax]  = useState('');

  useEffect(() => {
    fetchFilters().then(setOpts).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { page, limit: 20 };
    if (q)        params.q        = q;
    if (category) params.categorie = category;
    if (couleur)  params.couleur  = couleur;
    if (marque)   params.marque   = marque;
    if (type)     params.type     = type;
    if (yearMin)  params.yearMin  = yearMin;
    if (yearMax)  params.yearMax  = yearMax;
    fetchPieces(params)
      .then((res) => active && setData(res))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [q, category, couleur, marque, type, yearMin, yearMax, page]);

  const hasFilters = q || category || couleur || marque || type || yearMin || yearMax;

  function resetPage() { setPage(1); }

  function clearFilters() {
    setQ(''); setCategory(''); setCouleur('');
    setMarque(''); setType(''); setYearMin(''); setYearMax('');
    setPage(1);
  }

  // Active filter count badge
  const activeCount = [q, category, couleur, marque, type, yearMin || yearMax]
    .filter(Boolean).length;

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
            onChange={(e) => { resetPage(); setQ(e.target.value); }}
          />
        </div>
      </div>

      {/* ── Filter panel ── */}
      <div className="filter-panel">
        <div className="filter-panel-head">
          <span className="filter-panel-title">
            Filters {activeCount > 0 && <span className="count-pill">{activeCount}</span>}
          </span>
          {hasFilters && (
            <button className="btn-link" onClick={clearFilters}>Clear all</button>
          )}
        </div>

        <div className="filter-grid">
          {/* Category */}
          <div className="filter-field">
            <label className="filter-field-label">Category</label>
            <select className="filter-select" value={category}
              onChange={(e) => { resetPage(); setCategory(e.target.value); }}>
              <option value="">All</option>
              {opts.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Brand */}
          <div className="filter-field">
            <label className="filter-field-label">Brand</label>
            <select className="filter-select" value={marque}
              onChange={(e) => { resetPage(); setMarque(e.target.value); }}>
              <option value="">All</option>
              {opts.marques.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Model / vehicle type */}
          <div className="filter-field">
            <label className="filter-field-label">Model</label>
            <select className="filter-select" value={type}
              onChange={(e) => { resetPage(); setType(e.target.value); }}>
              <option value="">All</option>
              {opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Color */}
          <div className="filter-field">
            <label className="filter-field-label">Color</label>
            <select className="filter-select" value={couleur}
              onChange={(e) => { resetPage(); setCouleur(e.target.value); }}>
              <option value="">All</option>
              {opts.couleurs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Year range */}
          <div className="filter-field filter-field-year">
            <label className="filter-field-label">Year</label>
            <div className="year-range">
              <select className="filter-select" value={yearMin}
                onChange={(e) => { resetPage(); setYearMin(e.target.value); }}>
                <option value="">From</option>
                {[...opts.annees].reverse().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="year-sep">–</span>
              <select className="filter-select" value={yearMax}
                onChange={(e) => { resetPage(); setYearMax(e.target.value); }}>
                <option value="">To</option>
                {opts.annees.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {hasFilters && (
        <div className="active-chips">
          {category && <Chip label={`Category: ${category}`} onRemove={() => { setCategory(''); resetPage(); }} />}
          {marque   && <Chip label={`Brand: ${marque}`}      onRemove={() => { setMarque('');   resetPage(); }} />}
          {type     && <Chip label={`Model: ${type}`}        onRemove={() => { setType('');     resetPage(); }} />}
          {couleur  && <Chip label={`Color: ${couleur}`}     onRemove={() => { setCouleur('');  resetPage(); }} />}
          {(yearMin || yearMax) && (
            <Chip
              label={`Year: ${yearMin || '…'} – ${yearMax || '…'}`}
              onRemove={() => { setYearMin(''); setYearMax(''); resetPage(); }}
            />
          )}
          {q && <Chip label={`"${q}"`} onRemove={() => { setQ(''); resetPage(); }} />}
        </div>
      )}

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
            {hasFilters
              ? <button className="btn-link" onClick={clearFilters}>Clear all filters</button>
              : <>Analyze an image from the <Link to="/">Analyze</Link> tab.</>}
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
                {p.categorie        && <span className="chip chip-cat">{p.categorie}</span>}
                {p.reference        && <span className="chip">Ref. {p.reference}</span>}
                {p.couleur          && <span className="chip chip-color">{p.couleur}</span>}
                {p.anneeFabrication > 0 && <span className="list-year">{p.anneeFabrication}</span>}
              </div>
              <span className="list-arrow"><ChevronRight /></span>
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

function Chip({ label, onRemove }) {
  return (
    <span className="active-chip">
      {label}
      <button onClick={onRemove} aria-label="Remove filter">×</button>
    </span>
  );
}
