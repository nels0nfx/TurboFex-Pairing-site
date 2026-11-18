import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-24">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-2 text-mute">That page is not part of the new site yet.</p>
      <Link to="/" className="mt-6 inline-block text-accent underline">Go to the start</Link>
    </main>
  );
}
