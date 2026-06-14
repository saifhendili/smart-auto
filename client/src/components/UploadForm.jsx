import { useState, useEffect, useCallback } from 'react';
import { analyzePiece } from '../services/api.js';
import Notification from './Notification.jsx';
import PieceResult from './PieceResult.jsx';

function UploadIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 16V6m0 0-3.5 3.5M12 6l3.5 3.5M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// RF1 : import d'une image (fichier, glisser-déposer OU copier-coller) + analyse (RF2–RF10)
export default function UploadForm() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const selectFile = useCallback((f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(URL.createObjectURL(f));
  }, []);

  function onSelect(e) {
    selectFile(e.target.files[0]);
  }

  // Copier-coller (Ctrl+V) n'importe où sur la page
  const onPaste = useCallback(
    (e) => {
      for (const item of e.clipboardData?.items || []) {
        if (item.type.startsWith('image/')) {
          selectFile(item.getAsFile());
          e.preventDefault();
          break;
        }
      }
    },
    [selectFile]
  );

  useEffect(() => {
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onPaste]);

  // Glisser-déposer
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type.startsWith('image/')) selectFile(f);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await analyzePiece(file);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l’analyse.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="upload">
      <form onSubmit={onSubmit}>
        <label
          className={`dropzone${dragging ? ' is-drag' : ''}${preview ? ' has-image' : ''}`}
          onPaste={onPaste}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {preview ? (
            <img src={preview} alt="aperçu de la pièce" />
          ) : (
            <span className="dz-hint">
              <span className="dz-icon">
                <UploadIcon />
              </span>
              <strong>Déposez une image, ou cliquez pour parcourir</strong>
              <span>Vous pouvez aussi coller une capture (Ctrl + V) · JPG, PNG</span>
            </span>
          )}
          <input type="file" accept="image/*" onChange={onSelect} hidden />
        </label>

        <div className="upload-actions">
          <button type="submit" className="btn btn-primary" disabled={!file || loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Analyse en cours…' : 'Analyser la pièce'}
          </button>
          {file && !loading && <span className="upload-hint">Prêt à analyser</span>}
        </div>
      </form>

      {error && (
        <div className="notif notif-error">
          <span className="notif-ico">!</span>
          <p>{error}</p>
        </div>
      )}

      {result && (
        <>
          <Notification verification={result.verification} piece={result.piece} />
          <PieceResult piece={result.piece} />
        </>
      )}
    </section>
  );
}
