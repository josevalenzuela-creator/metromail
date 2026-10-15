import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import App from '@/components/App';

export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect('/');
  return <App />;
}
