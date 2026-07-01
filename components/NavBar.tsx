'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NavBar({ profile }: { profile: { display_name: string } | null }) {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <nav className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-xl text-yellow-400">
          ⚽ WC 2026
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/leaderboard" className="text-sm text-gray-400 hover:text-white transition-colors" title="Leaderboard">
            <span>🏆</span>
            <span className="hidden sm:inline"> Leaderboard</span>
          </Link>
          <Link href="/settings" className="text-gray-400 hover:text-white text-sm max-w-[100px] truncate transition-colors" title="Edit profile">{profile?.display_name}</Link>
          <a
            href="https://buymeacoffee.com/mattdz"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
            title="Support the app"
          >
            <span>☕</span>
            <span className="hidden sm:inline">Support</span>
          </a>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
