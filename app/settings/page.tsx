'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/NavBar'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<{ id: string; display_name: string } | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
        if (data) { setProfile(data); setName(data.display_name || '') }
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !profile) return
    if (trimmed === profile.display_name) { router.push('/dashboard'); return }
    setSaving(true)
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', profile.id)
    if (error) {
      setError('Failed to save — please try again.')
      setSaving(false)
      return
    }
    setProfile(p => p ? { ...p, display_name: trimmed } : p)
    setSaved(true)
    setSaving(false)
    setTimeout(() => router.push('/dashboard'), 1200)
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar profile={profile} />
      <main className="max-w-lg mx-auto p-6 pt-12">
        <h1 className="text-2xl font-bold mb-1">Account Settings</h1>
        <p className="text-gray-400 text-sm mb-8">Your display name is shown in group leaderboards.</p>

        <form onSubmit={save} className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Display name</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setSaved(false) }}
              maxLength={40}
              placeholder="Your name"
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-sm"
            />
            <p className="text-xs text-gray-600 mt-1">{name.trim().length}/40 characters</p>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {saved ? (
            <p className="text-green-400 text-sm font-medium">✓ Saved! Redirecting…</p>
          ) : (
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold rounded-lg text-sm transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-5 py-2 border border-gray-600 hover:border-gray-400 text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  )
}
