import UploadForm from '../components/UploadForm.jsx';

export default function HomePage() {
  return (
    <section>
      <h1>Analyse de pièces automobiles</h1>
      <p className="lead">
        Importez une ou plusieurs photos : l'IA identifie chaque pièce, extrait ses
        informations et vérifie si elle existe déjà dans la base.
      </p>
      <UploadForm />
    </section>
  );
}
