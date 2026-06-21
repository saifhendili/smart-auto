import { useState, useEffect, useCallback, useRef } from 'react';
import { analyzePiece } from '../services/api.js';
import Notification from './Notification.jsx';
import PieceResult from './PieceResult.jsx';

/* ── Rate-limit helpers (Gemini free: 8 req/min safe limit) ─── */
// We target 8 RPM → minimum 7.5 s between request STARTS.
// Measured from the moment each request fires (not when it returns),
// so fast responses don't accidentally push us over the limit.
const RPM_LIMIT      = 8;
const INTERVAL_MS    = Math.ceil(60_000 / RPM_LIMIT); // 7 500 ms
const RETRY_DELAY_MS = 65_000;

const ST = {
  pending:    { label: 'En attente',  cls: 'bs-pending'    },
  processing: { label: 'En cours…',   cls: 'bs-processing' },
  done:       { label: 'Enregistré',  cls: 'bs-done'       },
  duplicate:  { label: 'Doublon',     cls: 'bs-dup'        },
  error:      { label: 'Erreur',      cls: 'bs-error'      },
  retry:      { label: 'Limite IA…',  cls: 'bs-retry'      },
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isRateLimit(err) {
  const m = (err?.response?.data?.message || err?.message || '').toLowerCase();
  return m.includes('429') || m.includes('quota') || m.includes('rate');
}

function UploadIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════
   Single-image mode
══════════════════════════════════════════════════════════════ */
function SingleMode({ file, preview, onReset }) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await analyzePiece(file));
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'analyse.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <div className="upload-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Analyse en cours…' : 'Analyser la pièce'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            Changer d'image
          </button>
        </div>
      </form>
      {error && (
        <div className="notif notif-error">
          <span className="notif-ico">!</span><p>{error}</p>
        </div>
      )}
      {result && (
        <>
          <Notification verification={result.verification} piece={result.piece} />
          <PieceResult piece={result.piece} />
        </>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Batch mode (2+ images)
══════════════════════════════════════════════════════════════ */
function BatchMode({ initialFiles, onReset }) {
  const [items,   setItems]   = useState(() =>
    initialFiles.map((f) => ({ file: f, name: f.name, status: 'pending', info: '' }))
  );
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(0);
  const [retryIn, setRetryIn] = useState(0);
  const [waitSec, setWaitSec] = useState(0); // countdown between images
  const stopRef = useRef(false);

  function patch(idx, upd) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...upd } : it));
  }

  async function countdown(seconds, idx) {
    for (let s = seconds; s > 0 && !stopRef.current; s--) {
      setRetryIn(s);
      patch(idx, { info: `Rate limit — reprise dans ${s}s` });
      await sleep(1_000);
    }
    setRetryIn(0);
  }

  async function start() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);

    const pending = items
      .map((it, i) => ({ ...it, idx: i }))
      .filter((it) => it.status === 'pending');

    for (let pi = 0; pi < pending.length; pi++) {
      const { file, idx } = pending[pi];
      if (stopRef.current) break;

      patch(idx, { status: 'processing', info: '' });
      let attempts = 0, success = false;

      while (!success && !stopRef.current) {
        try {
          const requestStart = Date.now(); // ← start clock BEFORE the call
          const res = await analyzePiece(file);
          const isAiCall = res.source === 'ai';

          if (res.verification?.exists) {
            patch(idx, { status: 'duplicate', info: res.verification.message });
          } else {
            patch(idx, { status: 'done', info: res.piece?.nom || 'Enregistré' });
          }

          success = true;
          setDone((n) => n + 1);

          // Only pace AI calls; duplicates are instant MongoDB lookups, not Gemini
          const isLast = pi === pending.length - 1;
          if (isAiCall && !isLast && !stopRef.current) {
            // Time elapsed since we fired the request (includes Gemini response time)
            const elapsed  = Date.now() - requestStart;
            let toWait = Math.max(0, INTERVAL_MS - elapsed);

            // Tick down visibly so the user can see what's happening
            while (toWait > 0 && !stopRef.current) {
              setWaitSec(Math.ceil(toWait / 1_000));
              const chunk = Math.min(1_000, toWait);
              await sleep(chunk);
              toWait -= chunk;
            }
            setWaitSec(0);
          }

        } catch (err) {
          if (isRateLimit(err) && attempts < 3) {
            attempts++;
            patch(idx, { status: 'retry' });
            await countdown(Math.round(RETRY_DELAY_MS / 1_000), idx);
          } else {
            patch(idx, {
              status: 'error',
              info: err?.response?.data?.message || err?.message || 'Erreur',
            });
            success = true;
            setDone((n) => n + 1);
          }
        }
      }
    }
    setRunning(false);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
    setRetryIn(0);
    setWaitSec(0);
    setItems((prev) =>
      prev.map((it) =>
        it.status === 'processing' || it.status === 'retry'
          ? { ...it, status: 'pending', info: '' }
          : it
      )
    );
  }

  const total    = items.length;
  const pending  = items.filter((i) => i.status === 'pending').length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const summary  = {
    done:      items.filter((i) => i.status === 'done').length,
    duplicate: items.filter((i) => i.status === 'duplicate').length,
    error:     items.filter((i) => i.status === 'error').length,
  };

  return (
    <div className="batch-wrap">
      <div className="batch-actions">
        <span className="batch-count">{total} image{total > 1 ? 's' : ''}</span>
        {!running ? (
          <>
            <button className="btn btn-primary" onClick={start} disabled={pending === 0}>
              ▶ Lancer l'analyse
            </button>
            <button className="btn btn-ghost" onClick={onReset}>Changer les images</button>
          </>
        ) : (
          <button className="btn btn-danger" onClick={stop}>⏹ Arrêter</button>
        )}
      </div>

      <div className="batch-progress-wrap">
        <div className="batch-progress-bar">
          <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="batch-progress-label">
          <span>{done} / {total} traitées</span>
          {waitSec > 0 && (
            <span className="batch-ratelimit">⏱ Prochaine image dans {waitSec}s (limite Gemini)</span>
          )}
          {retryIn > 0 && (
            <span className="batch-ratelimit">⏳ Rate limit — reprise dans {retryIn}s</span>
          )}
          {!running && done > 0 && (
            <span className="batch-summary">
              ✅ {summary.done} &nbsp;·&nbsp; ⚠️ {summary.duplicate} doublons &nbsp;·&nbsp; ❌ {summary.error} erreurs
            </span>
          )}
        </div>
      </div>

      <div className="batch-list">
        {items.map((it, i) => {
          const s = ST[it.status] || ST.pending;
          return (
            <div key={i} className={`batch-row ${s.cls}`}>
              <span className="batch-fname" title={it.name}>{it.name}</span>
              <span className="batch-status">{s.label}</span>
              {it.info && <span className="batch-info" title={it.info}>{it.info}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main component — picks Single or Batch based on file count
══════════════════════════════════════════════════════════════ */
export default function UploadForm() {
  const [files,    setFiles]   = useState(null);   // null = no selection yet
  const [preview,  setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);

  const selectFiles = useCallback((fileList) => {
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setFiles(imgs);
    setPreview(imgs.length === 1 ? URL.createObjectURL(imgs[0]) : null);
  }, []);

  const onPaste = useCallback((e) => {
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) {
        selectFiles([item.getAsFile()]);
        e.preventDefault();
        break;
      }
    }
  }, [selectFiles]);

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    selectFiles(e.dataTransfer.files);
  }

  function reset() {
    setFiles(null);
    setPreview(null);
  }

  /* No files selected yet — show the drop zone */
  if (!files) {
    return (
      <section className="upload">
        <label
          className={`dropzone${dragging ? ' is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onPaste={onPaste}
        >
          <span className="dz-hint">
            <span className="dz-icon"><UploadIcon /></span>
            <strong>Déposez une ou plusieurs images, ou cliquez pour parcourir</strong>
            <span>Ctrl + V pour coller · JPG, PNG · sélection multiple autorisée</span>
          </span>
          <input type="file" accept="image/*" multiple onChange={(e) => selectFiles(e.target.files)} hidden />
        </label>
      </section>
    );
  }

  /* 1 file → show preview + single analysis */
  if (files.length === 1) {
    return (
      <section className="upload">
        <label
          className="dropzone has-image"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <img src={preview} alt="aperçu" />
          <input type="file" accept="image/*" multiple onChange={(e) => selectFiles(e.target.files)} hidden />
        </label>
        <SingleMode file={files[0]} preview={preview} onReset={reset} />
      </section>
    );
  }

  /* 2+ files → batch mode */
  return (
    <section className="upload">
      <BatchMode initialFiles={files} onReset={reset} />
    </section>
  );
}
