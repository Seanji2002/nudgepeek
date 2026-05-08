import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
let currentUrl: string | null = null

export function initSupabase(url: string, anonKey: string): void {
  currentUrl = url
  client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
}

export function isSupabaseInitialized(): boolean {
  return client !== null
}

export function getCurrentSupabaseUrl(): string | null {
  return currentUrl
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!client) {
      throw new Error('Supabase client used before initialization')
    }
    return Reflect.get(client, prop, receiver)
  },
})

export const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
