'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './lib/supabase'
import { Droplets } from 'lucide-react'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const redirigir = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      router.replace(user ? '/dashboard' : '/login')
    }
    redirigir()
  }, [router])

  return (
    <main className="flex items-center justify-center min-h-screen bg-mist">
      <span className="inline-flex items-center justify-center animate-pulse w-14 h-14 rounded-2xl bg-obsidian text-snow">
        <Droplets size={26} strokeWidth={2} />
      </span>
    </main>
  )
}
