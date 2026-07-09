'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RepartosRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/grupos?tab=repartos')
  }, [router])
  return null
}
