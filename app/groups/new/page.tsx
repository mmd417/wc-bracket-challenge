'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isTournamentStarted } from '@/lib/tournament-data'

function NewGroupForm() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramError = searchParams.get('error')
  const supabase = createClient()
  const locked = isTournamentStarted()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    const { data: groupId, error: rpcError } = await supabase.rpc('create_group', { group_name: name.trim() })

    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }

    // If tournament already started, auto-open entries so members can add late brackets
    if (locked && groupId) {
      await supabase.from('groups').update({ entries_open: true }).eq('id', groupId)
    }

    router.push(`/groups/${groupId}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl p-8 border border-gray-700">
        <h1 className="text-2xl font-bold mb-2">Create a Group</h1>
        {locked && (
          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4 mb-6 space-y-2 text-sm">
            <p className="text-yellow-400 font-semibold">⚠️ The tournament has already started</p>
            <ul className="text-yellow-200/80 space-y-1 list-disc list-inside">
              <li>Some World Cup games have already been played.</li>
              <li>Anyone who joins this group will be able to build and submit a new bracket.</li>
              <li>New brackets may be created with knowledge of early results, which could create an unfair advantage.</li>
              <li>You can lock your group at any time from the group page to stop new brackets from being added.</li>
            </ul>
          </div>
        )}
        {!locked && <p className="text-gray-400 text-sm mb-6">Invite friends to compete in your bracket challenge.</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Office World Cup Pool"
              required
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-yellow-500"
            />
          </div>
          {(error || paramError) && (
            <p className="text-red-400 text-sm">{error || decodeURIComponent(paramError!)}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-bold rounded-lg transition-colors"
          >
            {loading ? 'Creating…' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function NewGroupPage() {
  return <Suspense><NewGroupForm /></Suspense>
}
