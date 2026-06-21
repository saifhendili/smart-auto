import { useCallback, useRef, useState } from 'react';
import { analyzePiece } from '../services/api.js';

// Gemini free tier: 10 RPM → 7s between real AI calls is safe.
// Duplicates (hash/ref) are caught before the AI, so no delay needed for them.
const AI_DELAY_MS = 7_000;
const RETRY_DELAY_MS = 65_000; // wait 65s after a 429 rate-limit hit

const ST = {
  pending:    { label: 'En attente',  cls: 'bs-pending'    },
  processing: { label: 'En cours…',   cls: 'bs-processing' },
  done:       { label: 'Enregistré',  cls: 'bs-done'       },
  duplicate:  { label: 'Doublon',     cls: 'bs-dup'        },
  error:      { label: 'Erreur',      cls: 'bs-error'      },
  retry:      { label: 'Limite IA – reprise dans…', cls: 'bs-retry' },
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isRateLimit(err) {
  const msg = (err?.response?.data?.message || err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate');
}

export default function BatchUpload() {
  const [items, setItems]     = useState([]);   // { file, name, status, info }
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(0);
  const [retryIn, setRetryIn] = useState(0);
  const stopRef   = useRef(false);
  const timerRef  = useRef(null);

  // ── file picking ──────────────────────────────────────────────
  const addFiles = useCallback((files) => {
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, name: f.name, status: 'pending', info: '' }));
    if (!next.length) return;
    setItems((prev) => [...prev, ...next]);
    setDone(0);
  }, []);

  function onInput(e) { addFiles(e.target.files); e.target.value = ''; }

  function onDrop(e) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  // ── status helpers ────────────────────────────────────────────
  function patch(idx, update) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...update } : it));
  }

  // ── countdown for rate-limit retry ───────────────────────────
  async function countdown(seconds, idx) {
    for (let s = seconds; s > 0 && !stopRef.current; s--) {
      setRetryIn(s);
      patch(idx, { info: `Rate limit — reprise dans ${s}s` });
      await sleep(1_000);
    }
    setRetryIn(0);
  }

  // ── main queue runner ─────────────────────────────────────────
  async function start() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    setDone(0);

    const pending = items
      .map((it, i) => ({ ...it, idx: i }))
      .filter((it) => it.status === 'pending');

    let aiCallCount = 0;

    for (const { file, idx } of pending) {
      if (stopRef.current) break;

      patch(idx, { status: 'processing', info: '' });

      let attempts = 0;
      let success  = false;

      while (!success && !stopRef.current) {
        try {
          const res = await analyzePiece(file);
          const isNew = res.source === 'ai';

          if (res.verification?.exists) {
            patch(idx, { status: 'duplicate', info: res.verification.message });
          } else {
            patch(idx, { status: 'done', info: res.piece?.nom || 'Enregistré' });
          }

          // Only delay after a genuine AI call
          if (isNew) {
            aiCallCount++;
            const isLast = pending[pending.length - 1].idx === idx;
            if (!isLast && !stopRef.current) await sleep(AI_DELAY_MS);
          }

          success = true;
          setDone((n) => n + 1);

        } catch (err) {
          if (isRateLimit(err) && attempts < 3) {
            attempts++;
            patch(idx, { status: 'retry' });
            await countdown(Math.round(RETRY_DELAY_MS / 1000), idx);
            if (stopRef.current) break;
          } else {
            const msg = err?.response?.data?.message || err?.message || 'Erreur inconnue';
            patch(idx, { status: 'error', info: msg });
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
    clearTimeout(timerRef.current);
    setRunning(false);
    setRetryIn(0);
    setItems((prev) =>
      prev.map((it) => it.status === 'processing' || it.status === 'retry'
        ? { ...it, status: 'pending', info: '' }
        : it
      )
    );
  }

  function clear() {
    stop();
    setItems([]);
    setDone(0);
  }

  // ── derived ───────────────────────────────────────────────────
  const total    = items.length;
  const pending  = items.filter((i) => i.status === 'pending').length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const summary = {
    done:      items.filter((i) => i.status === 'done').length,
    duplicate: items.filter((i) => i.status === 'duplicate').length,
    error:     items.filter((i) => i.status === 'error').length,
  };

  // ── render ────────────────────────────────────────────────────
  return (
    <div className="batch-wrap">

      {/* Drop zone */}
      <label
        className="batch-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <strong>Déposez des images ici, ou cliquez pour sélectionner</strong>
        <span>JPG, PNG — plusieurs fichiers autorisés</span>
        <input type="file" accept="image/*" multiple onChange={onInput} hidden />
      </label>

      {/* Actions */}
      {total > 0 && (
        <div className="batch-actions">
          <span className="batch-count">{total} image{total > 1 ? 's' : ''} sélectionnée{total > 1 ? 's' : ''}</span>
          {!running ? (
            <>
              <button className="btn btn-primary" onClick={start} disabled={pending === 0}>
                ▶ Lancer l'analyse
              </button>
              <button className="btn btn-ghost" onClick={clear}>Vider</button>
            </>
          ) : (
            <button className="btn btn-danger" onClick={stop}>⏹ Arrêter</button>
          )}
        </div>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="batch-progress-wrap">
          <div className="batch-progress-bar">
            <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="batch-progress-label">
            <span>{done} / {total} traitées</span>
            {retryIn > 0 && (
              <span className="batch-ratelimit">⏳ Limite IA — reprise dans {retryIn}s</span>
            )}
            {!running && done > 0 && (
              <span className="batch-summary">
                ✅ {summary.done} &nbsp;·&nbsp; ⚠️ {summary.duplicate} doublons &nbsp;·&nbsp; ❌ {summary.error} erreurs
              </span>
            )}
          </div>
        </div>
      )}

      {/* File list */}
      {items.length > 0 && (
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
      )}
    </div>
  );
}
