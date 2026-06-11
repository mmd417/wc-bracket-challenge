'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { TEAMS } from '@/lib/tournament-data'

type BracketEntry = {
  id: string;
  bracket_id: string;
  user_id: string;
  group_id: string;
  brackets: {
    name: string;
    total_score: number;
    max_potential: number;
    group_stage_score: number;
    r32_score: number;
    r16_score: number;
    qf_score: number;
    sf_score: number;
    final_score: number;
  };
  profiles: {
    display_name: string;
  };
};

type GroupData = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

type Member = {
  id: string;
  user_id: string;
  group_id: string;
  joined_at: string;
  profiles: { display_name: string };
};

type Props = {
  group: GroupData;
  members: Member[];
  entries: BracketEntry[];
  currentUserId: string;
  winnerByBracket: Record<string, string>;
  liveScoreByBracket: Record<string, number>;
  dynamicMaxByBracket: Record<string, number>;
  locked?: boolean;
};

export default function GroupLeaderboard({ group, members, entries, currentUserId, winnerByBracket, liveScoreByBracket, dynamicMaxByBracket, locked = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [myBrackets, setMyBrackets] = useState<Array<{ id: string; name: string }>>([])
  const [addingBracket, setAddingBracket] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingEntry, setRemovingEntry] = useState<string | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [editingName, setEditingName] = useState(group.name)
  const [savingName, setSavingName] = useState(false)
  const supabase = createClient()
  const isOwner = group.created_by === currentUserId

  useEffect(() => {
    supabase
      .from('brackets')
      .select('id, name')
      .eq('user_id', currentUserId)
      .then(({ data }) => { setMyBrackets(data || []) })
  }, [currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  function copyInviteLink() {
    const url = `${window.location.origin}/groups/join?code=${group.invite_code}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function deleteGroup() {
    const first = window.confirm(`Are you sure you want to delete "${groupName}"? This cannot be undone.`)
    if (!first) return
    const second = window.confirm(`This will permanently delete the group and remove all ${entries.length} bracket entries. Delete anyway?`)
    if (!second) return
    setDeleting(true)
    await supabase.from('group_bracket_entries').delete().eq('group_id', group.id)
    await supabase.from('group_members').delete().eq('group_id', group.id)
    await supabase.from('groups').delete().eq('id', group.id)
    window.location.href = '/dashboard'
  }

  async function removeEntry(entryId: string) {
    if (!window.confirm('Remove this bracket from the group?')) return
    setRemovingEntry(entryId)
    await supabase.from('group_bracket_entries').delete().eq('id', entryId)
    window.location.reload()
    setRemovingEntry(null)
  }

  async function saveGroupName() {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === groupName) { setIsEditingName(false); return }
    setSavingName(true)
    const { error } = await supabase.from('groups').update({ name: trimmed }).eq('id', group.id)
    if (!error) setGroupName(trimmed)
    setSavingName(false)
    setIsEditingName(false)
  }

  async function enterBracket(bracketId: string) {
    setAddingBracket(true)
    await supabase.from('group_bracket_entries').insert({
      group_id: group.id,
      bracket_id: bracketId,
      user_id: currentUserId,
    })
    window.location.reload()
    setAddingBracket(false)
  }

  const enteredBracketIds = entries.map(e => e.bracket_id)
  const availableBrackets = myBrackets.filter(b => !enteredBracketIds.includes(b.id))

  // Sort entries by live score descending
  const sorted = [...entries].sort(
    (a, b) => (liveScoreByBracket[b.bracket_id] ?? b.brackets?.total_score ?? 0)
            - (liveScoreByBracket[a.bracket_id] ?? a.brackets?.total_score ?? 0)
  )

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Group header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          {isOwner && isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveGroupName()
                  if (e.key === 'Escape') { setIsEditingName(false); setEditingName(groupName) }
                }}
                onBlur={saveGroupName}
                maxLength={80}
                disabled={savingName}
                className="text-2xl sm:text-3xl font-bold bg-gray-800 border border-yellow-500 rounded-lg px-3 py-1 text-white focus:outline-none w-64 sm:w-80"
              />
              <span className="text-xs text-gray-500">Enter to save · Esc to cancel</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/name">
              <h1 className="text-2xl sm:text-3xl font-bold">{groupName}</h1>
              {isOwner && (
                <button
                  onClick={() => { setEditingName(groupName); setIsEditingName(true) }}
                  title="Rename group"
                  className="opacity-0 group-hover/name:opacity-100 transition-opacity text-gray-500 hover:text-gray-300 p-1 rounded"
                >
                  ✏️
                </button>
              )}
            </div>
          )}
          <p className="text-gray-400 mt-1 text-sm">
            {members.length} member{members.length !== 1 ? 's' : ''} · {entries.length} bracket{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-600 hover:border-gray-400 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap"
          >
            {copied ? '✓ Copied!' : '🔗 Invite'}
          </button>
          {isOwner && (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-gray-600 font-mono tracking-wide">{group.invite_code}</span>
              <button
                onClick={deleteGroup}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-800 hover:border-red-500 text-red-400 hover:text-red-300 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap"
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add bracket row — hidden after lock */}
      {locked && (
        <div className="mb-6 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-sm text-gray-400 text-center">
          🔒 Brackets are locked — the tournament has started
        </div>
      )}
      {!locked && <div className="flex gap-3 mb-6">
        <div className="flex-1 bg-gray-800 rounded-xl px-4 py-3 border border-yellow-500/30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 whitespace-nowrap">Add bracket:</span>
            {availableBrackets.length > 0 ? (
              <select
                onChange={e => { if (e.target.value) { enterBracket(e.target.value); e.target.value = '' } }}
                disabled={addingBracket}
                defaultValue=""
                className="flex-1 bg-gray-700 border border-gray-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-yellow-500"
              >
                <option value="" disabled>Select a bracket…</option>
                {availableBrackets.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-gray-500 italic">All your brackets are entered</span>
            )}
            <a
              href={`/brackets/new?group=${group.id}`}
              className="shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              + New
            </a>
          </div>
        </div>
      </div>}


      {/* Leaderboard */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg">Leaderboard</h2>
        </div>
        {sorted.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No brackets entered yet. Enter one above!
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {sorted.map((entry, idx) => {
              const isMe = entry.user_id === currentUserId
              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-4 p-4 transition-colors ${isMe ? 'bg-yellow-500/5' : ''}`}
                >
                  <Link href={`/brackets/${entry.bracket_id}`} className="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      idx === 0
                        ? 'bg-yellow-500 text-black'
                        : idx === 1
                        ? 'bg-gray-400 text-black'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {entry.profiles?.display_name || 'Unknown'}
                      {isMe && (
                        <span className="text-xs text-yellow-400 ml-1">(you)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400 truncate">{entry.brackets?.name}</div>
                    {(() => {
                      const code = winnerByBracket[entry.bracket_id]
                      const team = code ? TEAMS.find(t => t.code === code) : null
                      return team ? (
                        <div className="text-xs text-gray-500 mt-0.5">🏆 {team.flag} {team.name}</div>
                      ) : null
                    })()}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-yellow-400">
                      {liveScoreByBracket[entry.bracket_id] ?? entry.brackets?.total_score ?? 0} pts
                    </div>
                    {(() => {
                      const live = liveScoreByBracket[entry.bracket_id] ?? 0
                      const max = dynamicMaxByBracket[entry.bracket_id] ?? 0
                      return max > live ? (
                        <div className="text-xs text-green-400">Max: {max} pts</div>
                      ) : null
                    })()}
                  </div>
                  </Link>
                  {isMe && !locked && (
                    <button
                      onClick={() => removeEntry(entry.id)}
                      disabled={removingEntry === entry.id}
                      className="ml-2 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0"
                      title="Remove from group"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
