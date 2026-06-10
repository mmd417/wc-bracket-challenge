import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-8 overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/wc-hero.jpg')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Content */}
      <div className="relative z-10 text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-lg">
          WC 2026 Bracket Challenge
        </h1>
        <p className="text-gray-200 text-xl mb-8 drop-shadow">
          Predict the FIFA World Cup 2026. Compete with friends. Prove you know football.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors shadow-lg"
          >
            Get Started
          </Link>
        </div>
        {/* Slim feature row */}
        <div className="mt-10 flex justify-center gap-6 sm:gap-10 text-center">
          {[
            { icon: '📊', title: 'Group Stage' },
            { icon: '🏆', title: 'Knockout Bracket' },
            { icon: '👥', title: 'Private Groups' },
          ].map(f => (
            <div key={f.title} className="flex flex-col items-center gap-1">
              <span className="text-2xl">{f.icon}</span>
              <span className="text-xs text-gray-300 font-medium">{f.title}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
