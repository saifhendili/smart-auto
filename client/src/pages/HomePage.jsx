import UploadForm from '../components/UploadForm.jsx';

export default function HomePage() {
  return (
    <section>
      <h1>Analyse de pièces automobiles</h1>
      <p className="lead">
        Importez la photo d’une pièce : l’intelligence artificielle l’identifie, extrait
        automatiquement ses informations et vous indique si elle existe déjà dans la base.
      </p>
      <UploadForm />
    </section>
  );
}
