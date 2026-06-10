import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isTournamentStarted } from '@/lib/tournament-data'
import BracketBuilder from '@/components/BracketBuilder'
import NavBar from '@/components/NavBar'

export default async function NewBracketPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (isTournamentStarted()) redirect('/dashboard')

  const { group: groupId } = await searchParams

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
