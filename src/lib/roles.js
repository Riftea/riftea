export function isSuperAdmin(session) {
    return session?.user?.role === 'SUPERADMIN';
  }
  