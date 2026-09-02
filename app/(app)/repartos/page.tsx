import { redirect } from 'next/navigation'

// Los repartos viven dentro de Compartidos. El salto se hace en el servidor:
// como componente de cliente había que descargar y montar la página solo para
// que un efecto llamara a router.replace, y eso se veía como un parpadeo.
export default function RepartosRedirect() {
  redirect('/grupos?tab=repartos')
}
