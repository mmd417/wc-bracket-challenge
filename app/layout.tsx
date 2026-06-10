import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WC 2026 Bracket Challenge',
  description: 'Predict the 2026 FIFA World Cup bracket. Compete with friends. Prove you know football.',
  openGraph: {
    title: 'WC 2026 Bracket Challenge',
    description: 'Predict the 2026 FIFA World Cup bracket. Compete with friends. Prove you know football.',
    images: [{ url: '/wc-hero.jpg', width: 1920, height: 1080, alt: 'FIFA World Cup 2026 Bracket Challenge' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WC 2026 Bracket Challenge',
    description: 'Predict the 2026 FIFA World Cup bracket. Compete with friends. Prove you know football.',
    images: ['/wc-hero.jpg'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
