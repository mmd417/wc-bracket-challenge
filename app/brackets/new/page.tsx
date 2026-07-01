import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isTournamentStarted } from '@/lib/tournament-data'
import BracketBuilder from '@/components/BracketBuilder'
import NavBar from '@/components/NavBar'

export default async function NewBracketPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { group: groupId } = await searchParams

  if (isTournamentStarted()) {
    const { data: profileCheck, error: profileErr } = await supabase.from('profiles').select('allow_late_entry').eq('id', user.id).single()
    const hasLateEntry = !!profileCheck?.allow_late_entry

    let groupIsOpen = false
    if (groupId) {
      const { data: groupCheck, error: groupErr } = await supabase.from('groups').select('entries_open').eq('id', groupId).single()
      groupIsOpen = !!groupCheck?.entries_open
      console.log('[brackets/new] groupId:', groupId, 'entries_open:', groupCheck?.entries_open, 'groupIsOpen:', groupIsOpen, 'err:', groupErr?.message)
    }

    console.log('[brackets/new] userId:', user.id, 'allow_late_entry:', profileCheck?.allow_late_entry, 'hasLateEntry:', hasLateEntry, 'profileErr:', profileErr?.message)
    console.log('[brackets/new] decision — hasLateEntry:', hasLateEntry, 'groupIsOpen:', groupIsOpen, '→', (!hasLateEntry && !groupIsOpen) ? 'REDIRECT' : 'ALLOW')

    if (!hasLateEntry && !groupIsOpen) {
      console.error('[brackets/new] REDIRECTING — hasLateEntry:', hasLateEntry, 'groupIsOpen:', groupIsOpen)
      redirect('/dashboard')
    }
    console.log('[brackets/new] ALLOWING — hasLateEntry:', hasLateEntry, 'groupIsOpen:', groupIsOpen)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar profile={profile} />
      <BracketBuilder userId={user.id} bracket={null} returnToGroup={groupId} />
    </div>
  )
}
