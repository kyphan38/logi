import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/server-auth';

// Quyết định ở server để tránh nháy màn hình login khi đã đăng nhập.
export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? '/now' : '/login');
}
