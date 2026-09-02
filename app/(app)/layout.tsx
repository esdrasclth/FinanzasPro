import Shell from '@/app/components/Shell'
import { exigirPerfil } from '@/app/lib/sesion-server'

// Layout de todas las pantallas con sesión.
//
// La sesión y el perfil se resuelven una vez aquí. Las páginas piden lo mismo
// con `exigirPerfil()`, pero va envuelto en `cache()` de React, así que dentro
// de una misma petición solo se consulta la base una vez.
//
// El grupo (app) existe para esto: da un layout compartido a rutas hermanas
// sin añadir nada a la URL. Las pantallas públicas —login, registro,
// onboarding, offline— quedan fuera y no heredan el menú.
export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { perfil } = await exigirPerfil()

  return <Shell usuario={perfil}>{children}</Shell>
}

// Nota sobre el loading de la raíz: existía un app/loading.tsx que envolvía
// TODO, este layout incluido. Con esa frontera de Suspense por encima, Next
// empezaba a enviar la respuesta (200) antes de que el layout resolviera la
// sesión, así que el redirect a /login o /onboarding ya no podía viajar como
// 307 y se degradaba a un salto en el cliente: la pantalla protegida llegaba
// a pintarse. Se retiró para que este layout bloquee y el redirect sea real.
// Las pantallas de dentro del grupo siguen con su propio loading.tsx.
