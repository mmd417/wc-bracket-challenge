'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// Use detectSessionInUrl: false so the Supabase client doesn't try to
// auto-handle ?code= or #access_token before our explicit logic runs.
function createConfirmClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false } }
  )
}

async function upsertProfile(supabase: ReturnType<typeof createConfirmClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email!, display_name: displayName },
    { onConflict: 'id', ignoreDuplicates: true }
  )
}

function ConfirmAuth() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')
  const supabase = createConfirmClient()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    async function handleAuth() {
      const redirect = searchParams.get('redirect') || '/dashboard'

      // Case 1: PKCE — ?code= (future OAuth flows)
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) { setError(error.message); return }
        await upsertProfile(supabase)
        router.replace(redirect)
        return
      }

      // Case 2: token_hash — ?token_hash=&type= (some Supabase configurations)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type') as 'magiclink' | 'email' | null
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (error) { setError(error.message); return }
        await upsertProfile(supabase)
        router.replace(redirect)
        return
      }

      // Case 3: Implicit flow — #access_token= in the URL hash.
      // The Supabase client detects and processes the hash automatically on init.
      // The full URL (including hash) is preserved when opening cross-app/cross-browser
      // on iOS and Android, so this works even when switching from Gmail → Safari/Chrome.
      // Poll until the session is available (up to 10 seconds for slow connections).
      let attempts = 0
      const poll = setInterval(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          clearInterval(poll)
          await upsertProfile(supabase)
          router.replace(redirect)
          return
        }
        attempts++
        if (attempts > 40) {
          clearInterval(poll)
          setError('Sign-in link expired or already used. Please request a new one.')
        }
      }, 250)
    }

    handleAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-4">
        <div className="text-center bg-gray-800 p-8 rounded-2xl max-w-md border border-gray-700">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Sign-in failed</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <a href="/login" className="px-6 py-2 bg-yellow-500 text-black font-bold rounded-lg">
            Try again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">⚽</div>
        <p className="text-gray-400">Signing you in…</p>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense><ConfirmAuth /></Suspense>
}
