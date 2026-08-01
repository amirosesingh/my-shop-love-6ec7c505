// Attaches the bearer token from the external Supabase project to server-fn calls.
import { createMiddleware } from '@tanstack/react-start'
import { supabaseExternal } from './external-client'

export const attachExternalSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const { data } = await supabaseExternal.auth.getSession()
    const token = data.session?.access_token
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
