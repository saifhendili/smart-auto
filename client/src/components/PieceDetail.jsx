import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchPiece } from '../services/api.js';
import PieceResult from './PieceResult.jsx';

// RF9 : fiche détaillée d'une pièce enregistrée (consultation, édition, suppression)
export default function PieceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [piece, setPiece] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPiece(id)
      .then(setPiece)
      .catch(() => setError('Pièce introuvable.'));
  }, [id]);

  return (
    <section>
      <Link to="/catalogue" className="back-link">
        ← Retour au catalogue
      </Link>
      {error ? (
        <div className="empty">
          <h3>{error}</h3>
        </div>
      ) : !piece ? (
        <div className="skeleton card" style={{ height: 280 }} />
      ) : (
        <PieceResult piece={piece} allowDelete onDeleted={() => navigate('/catalogue')} />
      )}
    </section>
  );
}
