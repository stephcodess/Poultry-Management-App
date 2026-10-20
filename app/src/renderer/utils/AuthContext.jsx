import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export const ROLE_ORDER = { owner: 4, admin: 3, editor: 2, viewer: 1 }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    window.api.auth.loadSession().then(s => {
      if (s) {
        window.api.auth.setSession(s)
        setSession(s)
      } else {
        setSession(null)
      }
    })
  }, [])

  async function login(email, password) {
    const result = await window.api.auth.login({ email, password })
    if (result.success) {
      await window.api.auth.saveSession(result.user)
      window.api.auth.setSession(result.user)
      setSession(result.user)
    }
    return result
  }

  async function logout() {
    await window.api.auth.logout()
    window.api.auth.setSession(null)
    setSession(null)
  }

  // can('write'), can('manage_users'), can('view'), can('owner_only')
  function can(action) {
    if (!session) return false
    const role = session.role
    if (action === 'view') return true
    if (action === 'write') return role === 'owner' || role === 'admin' || role === 'editor'
    if (action === 'manage_users') return role === 'owner' || role === 'admin'
    if (action === 'owner_only') return role === 'owner'
    return false
  }

  return (
    <AuthContext.Provider value={{ session, login, logout, can, setSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
