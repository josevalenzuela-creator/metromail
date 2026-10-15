import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect('/app');
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><span className="brand-name">MetroMail</span><span className="brand-ai">AI</span></div>
        <h1>Leído no es gestionado.</h1>
        <p>Tu Gmail con estados de gestión, seguimientos, tareas del equipo y tu SLA de respuesta, en un solo lugar.</p>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <a className="btn btn-primary btn-lg" href="/api/auth/login">Entrar con Google</a>
        <p className="login-note">Pediremos permiso para leer, organizar y enviar correo en tu nombre. MetroMail no guarda tu contraseña.</p>
      </div>
    </main>
  );
}
