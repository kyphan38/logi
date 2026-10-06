import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/server-auth';

// Decided on the server to avoid flashing the login screen when already signed in.
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? '/now' : '/login');
}
