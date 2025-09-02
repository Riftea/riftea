// src/app/providers.js
'use client'

import React from 'react'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children, session }) {
  return (
    <SessionProvider session={session}>
      {children}
    </SessionProvider>
  )
}