'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SupportCard({ userId, announcement }: { userId: string; announcement: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!feedback.trim()) return
    setSending(true)
    setError('')
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      message: feedback.trim(),
    })
    if (error) {
      setError('Failed to send — please try again.')
      setSending(false)
      return
    }
    setSent(true)
    setFeedback('')
    setSending(false)
  }

  return (
    <div className="mt-12 mb-6 bg-gray-800/60 border border-gray-700 rounded-2xl p-6">
      {announcement && (() => {
        const lines = announcement.split('\n').filter(l => l.trim())
        const latest = lines[0]
        const hasMore = lines.length > 1
        return (
          <div className="mb-5 pb-5 border-b border-gray-700">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide">📣 From the developer</p>
              {hasMore && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {expanded ? 'Show less ▲' : 'Show more ▼'}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-300">{latest}</p>
            {expanded && (
              <div className="mt-2 space-y-1 border-t border-gray-700 pt-2">
                {lines.slice(1).map((line, i) => (
                  <p key={i} className="text-sm text-gray-500">{line}</p>
                ))}
              </div>
            )}
          </div>
        )
      })()}
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">

        {/* Support */}
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">☕ Enjoying the app?</h3>
          <p className="text-sm text-gray-400 mb-3">
            Built for fun — if you&apos;d like to support it, a coffee goes a long way.
          </p>
          <a
            href="https://buymeacoffee.com/mattdz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm transition-colors"
          >
            ☕ Buy me a coffee
          </a>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-gray-700 self-stretch" />
        <div className="block sm:hidden h-px bg-gray-700" />

        {/* Feedback */}
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">💬 Share feedback</h3>
          <p className="text-sm text-gray-400 mb-3">
            Bug, idea, or suggestion? I&apos;d love to hear it.
          </p>
          {sent ? (
            <p className="text-sm text-green-400">✓ Thanks for the feedback!</p>
          ) : (
            <form onSubmit={submitFeedback} className="space-y-2">
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="What's on your mind…"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 resize-none"
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={sending || !feedback.trim()}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {sending ? 'Sending…' : 'Send Feedback'}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  )
}
