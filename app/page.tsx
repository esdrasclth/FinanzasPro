import { redirect } from 'next/navigation'
import { getSessionUser } from './lib/auth-server'

// El proxy ya resuelve "/" antes de renderizar; esto queda como respaldo por si
// alguna vez se desactiva.
export default async function Home() {
  const session = await getSessionUser()
  redirect(session ? '/dashboard' : '/login')
}
