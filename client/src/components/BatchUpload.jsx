import { useCallback, useRef, useState } from 'react';
import { analyzePiece, checkImage } from '../services/api.js';

// ── Rate limit strategy ──────────────────────────────────────────────────────
//
// Phase 1  — run checkImage() for ALL files IN PARALLEL (pure DB hash lookup,
//            no AI involved → no rate limit concern).
//            Duplicates are marked immediately and skipped from phase 2.
//
// Phase 2  — run analyzePiece() ONLY for new images, one at a time.
//            Each image now uses 2 Gemini calls (search + extract).
//            gemini-2.5-flash free tier: 10 RPM → safe at 5 images/min (10 calls/min).
//            We wait BEFORE each call (proactive), never touching the limit.
//
const SAFE_RPM    = 5;
const INTERVAL_MS = Math.ceil(60_000 / SAFE_RPM); // 12 000 ms

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ST = {
  pending:    { label: 'Pending',     cls: 'bs-pending'    },
  checking:   { label: 'Checking…',   cls: 'bs-processing' },
  waiting:    { label: 'Waiting…',    cls: 'bs-retry'      },
  processing: { label: 'Analyzing…',  cls: 'bs-processing' },
  done:       { label: 'Saved',       cls: 'bs-done'       },
  duplicate:  { label: 'Duplicate',   cls: 'bs-dup'        },
  error:      { label: 'Error',       cls: 'bs-error'      },
};

export default function BatchUpload() {
  const [items,   setItems]   = useState([]);
  const [running, setRunning] = useState(false);
  const [phase,   setPhase]   = useState('');   // 'checking' | 'analyzing' | ''
  const [done,    setDone]    = useState(0);
  const [waitSec, setWaitSec] = useState(0);
  const stopRef = useRef(false);

  // ── file selection ───────────────────────────────────────────────────────
  const addFiles = useCallback((files) => {
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, name: f.name, status: 'pending', info: '' }));
    if (!next.length) return;
    setItems((prev) => [...prev, ...next]);
  }, []);

  function onInput(e) { addFiles(e.target.files); e.target.value = ''; }
  function onDrop(e)  { e.preventDefault(); addFiles(e.dataTransfer.files); }

  function patch(idx, update) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...update } : it));
  }

  // ── countdown helper (shown between AI calls) ────────────────────────────
  async function waitWithCountdown(ms) {
    let remaining = ms;
    while (remaining > 0 && !stopRef.current) {
      setWaitSec(Math.ceil(remaining / 1_000));
      await sleep(Math.min(1_000, remaining));
      remaining -= 1_000;
    }
    setWaitSec(0);
  }

  // ── main runner ──────────────────────────────────────────────────────────
  async function start() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setWaitSec(0);

    const pending = items
      .map((it, i) => ({ ...it, idx: i }))
      .filter((it) => it.status === 'pending');

    if (!pending.length) { setRunning(false); return; }

    // ── PHASE 1 : parallel hash checks (no AI, no rate limit) ──────────────
    setPhase('checking');
    pending.forEach(({ idx }) => patch(idx, { status: 'checking', info: '' }));

    const checkResults = await Promise.all(
      pending.map(async ({ file, idx }) => {
        try {
          const res = await checkImage(file);
          return { idx, file, isDuplicate: res.exists, piece: res.piece };
        } catch {
          return { idx, file, isDuplicate: false };
        }
      })
    );

    // Mark phase-1 duplicates immediately
    const toAnalyze = [];
    for (const r of checkResults) {
      if (r.isDuplicate) {
        patch(r.idx, {
          status: 'duplicate',
          info: r.piece?.nom ? `Already in DB: ${r.piece.nom}` : 'Already in DB',
        });
        setDone((n) => n + 1);
      } else {
        toAnalyze.push(r);
      }
    }

    // ── PHASE 2 : rate-limited AI calls for new images only ─────────────────
    setPhase('analyzing');
    let lastCallStart = 0;

    for (let i = 0; i < toAnalyze.length; i++) {
      if (stopRef.current) break;

      const { idx, file } = toAnalyze[i];

      // Proactive wait BEFORE the call (never touch the limit)
      if (i > 0) {
        const elapsed = Date.now() - lastCallStart;
        const toWait  = INTERVAL_MS - elapsed;
        if (toWait > 0) {
          patch(idx, { status: 'waiting', info: '' });
          await waitWithCountdown(toWait);
        }
      }

      if (stopRef.current) break;

      patch(idx, { status: 'processing', info: '' });
      lastCallStart = Date.now();

      try {
        const res = await analyzePiece(file);

        if (res.verification?.exists) {
          patch(idx, { status: 'duplicate', info: res.verification.message });
        } else {
          patch(idx, { status: 'done', info: res.piece?.nom || 'Saved' });
        }
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'Unknown error';
        patch(idx, { status: 'error', info: msg });
      }

      setDone((n) => n + 1);
    }

    setPhase('');
    setRunning(false);
    setWaitSec(0);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
    setPhase('');
    setWaitSec(0);
    setItems((prev) =>
      prev.map((it) =>
        ['checking', 'waiting', 'processing'].includes(it.status)
          ? { ...it, status: 'pending', info: '' }
          : it
      )
    );
  }

  function clear() { stop(); setItems([]); setDone(0); }

  // ── derived stats ────────────────────────────────────────────────────────
  const total    = items.length;
  const pending  = items.filter((i) => i.status === 'pending').length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const summary  = {
    done:      items.filter((i) => i.status === 'done').length,
    duplicate: items.filter((i) => i.status === 'duplicate').length,
    error:     items.filter((i) => i.status === 'error').length,
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="batch-wrap">

      {/* Drop zone */}
      <label className="batch-drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <strong>Drop images here, or click to select</strong>
        <span>JPG, PNG — unlimited files</span>
        <input type="file" accept="image/*" multiple onChange={onInput} hidden />
      </label>

      {/* Actions */}
      {total > 0 && (
        <div className="batch-actions">
          <span className="batch-count">{total} image{total !== 1 ? 's' : ''} selected</span>
          {!running ? (
            <>
              <button className="btn btn-primary" onClick={start} disabled={pending === 0}>
                ▶ Start analysis
              </button>
              <button className="btn btn-ghost" onClick={clear}>Clear</button>
            </>
          ) : (
            <button className="btn btn-danger" onClick={stop}>⏹ Stop</button>
          )}
        </div>
      )}

      {/* Progress */}
      {total > 0 && (
        <div className="batch-progress-wrap">
          <div className="batch-progress-bar">
            <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="batch-progress-label">
            {phase === 'checking'  && <span className="batch-phase">⚡ Phase 1 — checking duplicates…</span>}
            {phase === 'analyzing' && <span className="batch-phase">🤖 Phase 2 — AI analysis ({SAFE_RPM} req/min)</span>}
            <span>{done} / {total} processed</span>
            {waitSec > 0 && (
              <span className="batch-ratelimit">⏱ Next image in {waitSec}s</span>
            )}
            {!running && done > 0 && (
              <span className="batch-summary">
                ✅ {summary.done} saved &nbsp;·&nbsp;
                ⚠️ {summary.duplicate} duplicates &nbsp;·&nbsp;
                ❌ {summary.error} errors
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
