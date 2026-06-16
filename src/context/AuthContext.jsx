import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('staff_app_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function initSession() {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!active) return

        const sessionUser = data.session?.user ?? null

        if (sessionUser) {
          const userProfile = await fetchProfile(sessionUser.id)
          if (!active) return

          if (!userProfile) {
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          } else {
            setUser(sessionUser)
            setProfile(userProfile)
          }
        } else {
          setUser(null)
          setProfile(null)
        }
      } catch {
        if (active) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    initSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(async () => {
        if (!active) return

        const sessionUser = session?.user ?? null

        if (sessionUser) {
          try {
            const userProfile = await fetchProfile(sessionUser.id)
            if (!active) return

            if (!userProfile) {
              await supabase.auth.signOut()
              setUser(null)
              setProfile(null)
            } else {
              setUser(sessionUser)
              setProfile(userProfile)
            }
          } catch {
            if (!active) return
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          }
        } else {
          setUser(null)
          setProfile(null)
        }

        if (active) setLoading(false)
      }, 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setUser(null)
    setProfile(null)
  }

  const value = useMemo(
    () => ({ user, profile, loading, signOut }),
    [user, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
