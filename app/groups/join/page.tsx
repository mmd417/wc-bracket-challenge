'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import NavBar from '@/components/NavBar'
import { isTournamentStarted } from '@/lib/tournament-data'

type GroupPreview = {
  id: string
  name: string
  invite_code: string
}

type EntryPreview = {
  id: string
  user_id: string
  brackets: { name: string } | null
  profiles: { display_name: string } | null
}

function JoinPage() {
  const searchParams = useSearchParams()
  const codeParam = searchParams.get('code') || ''
  const [code, setCode] = useState(codeParam)
  const [group, setGroup] = useState<GroupPreview | null>(null)
  const [entries, setEntries] = useState<EntryPreview[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [isMember, setIsMember] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [allowLateEntry, setAllowLateEntry] = useState(false)
  const [entriesOpen, setEntriesOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Auto-load preview if code is in URL
  useEffect(() => {
    if (codeParam) loadPreview(codeParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('allow_late_entry').eq('id', user.id).single()
        .then(({ data }) => { if (data?.allow_late_entry) setAllowLateEntry(true) })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPreview(inviteCode: string) {
    setLoadingPreview(true)
    setError('')

    const { data: foundGroup } = await supabase
      .from('groups')
      .select('id, name, invite_code')
      .eq('invite_code', inviteCode.trim())
      .single()

    if (!foundGroup) {
      setError('Group not found. Check the invite code.')
      setLoadingPreview(false)
      return
    }

    setGroup(foundGroup)

    // Fetch entries_open flag
    const { data: groupDetail } = await supabase
      .from('groups')
      .select('entries_open')
      .eq('id', foundGroup.id)
      .single()
    setEntriesOpen(!!groupDetail?.entries_open)

    // Fetch member count
    const { count } = await supabase
      .from('group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', foundGroup.id)
    setMemberCount(count ?? 0)

    // Fetch leaderboard entries (no champion picks)
    const { data: entriesData } = await supabase
      .from('group_bracket_entries')
      .select('id, user_id, brackets(name), profiles(display_name)')
      .eq('group_id', foundGroup.id)
    setEntries((entriesData as unknown as EntryPreview[]) || [])

    // Check if current user is already a member
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      const { data: membership } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', foundGroup.id)
        .eq('user_id', user.id)
        .single()
      setIsMember(!!membership)
    }

    setLoadingPreview(false)
  }

  async function handleJoin() {
    if (!group) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/groups/join?code=${encodeURIComponent(group.invite_code)}`)
      return
    }
    setJoining(true)
    const { error: err } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id })
    if (err && !err.message.includes('duplicate')) {
      setError(err.message)
      setJoining(false)
      return
    }
    router.push(`/groups/${group.id}`)
  }

  const locked = isTournamentStarted() && !allowLateEntry && !entriesOpen
  const sorted = entries

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <NavBar profile={null} />
      <div className="max-w-lg mx-auto px-4 py-12">

        {/* If no group loaded yet, show the code entry form */}
        {!group && (
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h1 className="text-2xl font-bold mb-2">You&apos;ve been invited!</h1>
            <p className="text-gray-400 mb-6 text-sm">Enter your invite code to preview the group.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Invite Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="8-character code"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-yellow-500 font-mono"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                onClick={() => loadPreview(code)}
                disabled={loadingPreview || !code.trim()}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-bold rounded-lg transition-colors"
              >
                {loadingPreview ? 'Loading…' : 'Preview Group'}
              </button>
            </div>
          </div>
        )}

        {/* Group preview */}
        {group && (
          <div className="space-y-4">
            <p className="text-gray-400 text-sm text-center">You&apos;ve been invited to join</p>

            {/* Group card */}
            <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
              <div className="p-6 border-b border-gray-700">
                <h1 className="text-2xl font-bold">{group.name}</h1>
                <p className="text-gray-400 text-sm mt-1">
                  {memberCount} member{memberCount !== 1 ? 's' : ''} · {entries.length} bracket{entries.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Leaderboard preview */}
              <div className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Current Standings</p>
                {sorted.length === 0 ? (
                  <p className="text-gray-500 text-sm italic py-2">No brackets entered yet — be the first!</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {(showAll ? sorted : sorted.slice(0, 6)).map((entry, idx) => (
                        <div key={entry.id} className="flex items-center gap-3 py-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            idx === 0 ? 'bg-yellow-500 text-black'
                            : idx === 1 ? 'bg-gray-400 text-black'
                            : idx === 2 ? 'bg-amber-700 text-white'
                            : 'bg-gray-700 text-gray-300'
                          }`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {entry.profiles?.display_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{entry.brackets?.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {sorted.length > 6 && (
                      <button
                        onClick={() => setShowAll(v => !v)}
                        className="w-full mt-2 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        {showAll ? '▲ Show less' : `▼ See all ${sorted.length} entries`}
                      </button>
                    )}
                  </>
                )}
                <p className="text-xs text-gray-600 mt-4 text-center italic">
                  Champion picks are hidden until you join
                </p>
              </div>
            </div>

            {/* CTA */}
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            {isMember ? (
              <button
                onClick={() => router.push(`/groups/${group.id}`)}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
              >
                Go to Group →
              </button>
            ) : locked ? (
              <div className="w-full py-3 bg-gray-800 border border-gray-700 rounded-lg text-center text-gray-500 text-sm">
                🔒 The tournament has started and this group is not accepting new members
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-bold rounded-lg transition-colors"
              >
                {joining ? 'Joining…' : `Join ${group.name}`}
              </button>
            )}
            {!currentUserId && !locked && (
              <p className="text-center text-sm text-gray-500">
                You&apos;ll be asked to sign in before joining
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function JoinGroupPage() {
  return (
    <Suspense>
      <JoinPage />
    </Suspense>
  )
}
