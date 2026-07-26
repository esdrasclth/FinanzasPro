'use client'

import { createContext, useContext } from 'react'
import { simboloMoneda, formatoMoneda } from './dinero'

const MonedaContext = createContext<string>('HNL')

export function MonedaProvider({ moneda, children }: { moneda?: string; children: React.ReactNode }) {
  return <MonedaContext.Provider value={moneda || 'HNL'}>{children}</MonedaContext.Provider>
}

// Devuelve la moneda principal del usuario y utilidades para mostrarla.
export function useMoneda() {
  const moneda = useContext(MonedaContext)
  return {
    moneda,
    simbolo: simboloMoneda(moneda),
    fmt: (n: number) => formatoMoneda(n, moneda),
  }
}
