import { NextResponse } from 'next/server'

// All auth is now handled client-side at /auth/confirm, which covers
// PKCE (?code=), token_hash (?token_hash=), and implicit flow (#access_token=).
// This redirect ensures any old magic links still in users' inboxes are handled.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const params = searchParams.toString()
  const destination = `${origin}/auth/confirm${params ? `?${params}` : ''}`
  return NextResponse.redirect(destination)
}
