'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function createGroup(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = formData.get('name') as string
  if (!name?.trim()) return

  const { data: groupId, error } = await supabase.rpc('create_group', { group_name: name.trim() })

  if (error) {
    redirect(`/groups/new?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`/groups/${groupId}`)
}

export default async function NewGroupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-950">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl p-8 border border-gray-700">
        <h1 className="text-2xl font-bold mb-6">Create a Group</h1>
        <form action={createGroup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Group Name</label>
            <input
              type="text"
              name="name"
              placeholder="e.g. Office World Cup Pool"
              required
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-yellow-500"
            />
          </div>
          {params.error && <p className="text-red-400 text-sm">{decodeURIComponent(params.error)}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg"
          >
            Create Group
          </button>
        </form>
      </div>
    </div>
  )
}
