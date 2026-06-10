'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DeleteBracketButton({ bracketId, bracketName }: { bracketId: string; bracketName: string }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const first = window.confirm(`Delete "${bracketName}"? This cannot be undone.`)
    if (!first) return
    const second = window.confirm(`Are you absolutely sure? This will permanently delete "${bracketName}" and remove it from any groups.`)
    if (!second) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('group_bracket_entries').delete().eq('bracket_id', bracketId)
    await supabase.from('knockout_picks').delete().eq('bracket_id', bracketId)
    await supabase.from('third_place_picks').delete().eq('bracket_id', bracketId)
    await supabase.from('group_picks').delete().eq('bracket_id', bracketId)
    await supabase.from('brackets').delete().eq('id', bracketId)
    window.location.reload()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      title="Delete bracket"
      className="shrink-0 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
    >
      {deleting ? '…' : '🗑'}
    </button>
  )
}
