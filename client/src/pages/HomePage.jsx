import { useState } from 'react';
import UploadForm from '../components/UploadForm.jsx';
import BatchUpload from '../components/BatchUpload.jsx';

export default function HomePage() {
  const [mode, setMode] = useState('single');

  return (
    <section>
      <h1>Analyse de pièces automobiles</h1>
      <p className="lead">
        Importez une ou plusieurs photos : l'IA identifie chaque pièce, extrait ses
        informations et vérifie si elle existe déjà dans la base.
      </p>

      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'single' ? 'active' : ''}`}
          onClick={() => setMode('single')}
        >
          Single image
        </button>
        <button
          className={`mode-tab ${mode === 'batch' ? 'active' : ''}`}
          onClick={() => setMode('batch')}
        >
          Batch (100+)
        </button>
      </div>

      {mode === 'single' ? <UploadForm /> : <BatchUpload />}
    </section>
  );
}
