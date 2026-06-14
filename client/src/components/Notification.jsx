import { Link } from 'react-router-dom';

// RF10 : bandeau de notification du résultat de la vérification
export default function Notification({ verification, piece }) {
  if (!verification) return null;
  const exists = verification.exists;
  return (
    <div className={`notif ${exists ? 'notif-exists' : 'notif-new'}`}>
      <span className="notif-ico">{exists ? '✓' : '＋'}</span>
      <p>{verification.message}</p>
      {exists && piece?._id && (
        <Link to={`/pieces/${piece._id}`} className="btn-link">
          Voir la fiche →
        </Link>
      )}
    </div>
  );
}
