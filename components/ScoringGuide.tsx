'use client'
import { useState, useEffect } from 'react'

const GROUP_ROWS = [
  { label: 'Correct finishing position', pts: '+1 pt', note: 'per team' },
  { label: 'Team advances from group', pts: '+1 pt', note: 'per team' },
]

const KNOCKOUT_ROWS = [
  { label: 'Round of 32', pts: '+2 pts' },
  { label: 'Round of 16', pts: '+4 pts' },
  { label: 'Quarterfinal', pts: '+6 pts' },
  { label: 'Semifinal', pts: '+10 pts' },
  { label: 'Final / Champion', pts: '+15 pts' },
]

export default function ScoringGuide() {
  const [expanded, setExpanded] = useState(true)

  // Load saved preference
  useEffect(() => {
    const saved = localStorage.getItem('scoring-guide-expanded')
    if (saved !== null) setExpanded(saved === 'true')
  }, [])

  function toggle() {
    const next = !expanded
    setExpanded(next)
    localStorage.setItem('scoring-guide-expanded', String(next))
  }

  return (
    <div className="mt-8 mb-4 bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-700/30 transition-colors"
      >
        <span className="font-semibold text-white text-sm flex items-center gap-2">
          📊 Scoring Guide
        </span>
        <span className="text-xs text-gray-400">{expanded ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <div className="px-6 pb-5 border-t border-gray-700">
          {/* Group Stage */}
          <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide mt-4 mb-2">Group Stage</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {GROUP_ROWS.map(r => (
              <div key={r.label} className="flex items-center justify-between sm:contents">
                <span className="text-sm text-gray-300 col-span-2">{r.label}</span>
                <span className="text-sm font-semibold text-yellow-400 text-right">
                  {r.pts} <span className="text-gray-500 font-normal text-xs">{r.note}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Knockout Rounds */}
          <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wide mt-4 mb-2">Knockout Rounds</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {KNOCKOUT_ROWS.map(r => (
              <div key={r.label} className="flex items-center justify-between sm:contents">
                <span className="text-sm text-gray-300 col-span-2">{r.label}</span>
                <span className="text-sm font-semibold text-yellow-400 text-right">{r.pts}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-600 mt-4">Points are awarded per correct pick in each round.</p>
        </div>
      )}
    </div>
  )
}
