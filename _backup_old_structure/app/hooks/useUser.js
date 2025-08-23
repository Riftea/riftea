// hooks/useUser.js - CREAR este archivo
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

export function useUser() {
  const { data: session, status } = useSession()
  const [userDetails, setUserDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (session?.user?.email) {
      fetchUserDetails()
    } else if (status !== 'loading') {
      setLoading(false)
    }
  }, [session, status])

  const fetchUserDetails = async () => {
    try {
      setError(null)
      const response = await fetch('/api/users/me')
      const data = await response.json()
      
      if (data.success) {
        setUserDetails(data.user)
      } else {
        setError(data.error || 'Error al cargar datos del usuario')
      }
    } catch (error) {
      console.error('Error fetching user details:', error)
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const refreshUserDetails = () => {
    if (session?.user?.email) {
      setLoading(true)
      fetchUserDetails()
    }
  }

  return {
    // Datos básicos de NextAuth
    user: session?.user,
    session,
    status,
    
    // Datos completos de Supabase
    userDetails,
    
    // Estados
    isLoading: loading || status === 'loading',
    isAuthenticated: !!session,
    error,
    
    // Funciones
    refreshUserDetails
  }
}