// src/lib/authz.js
export function normalizeRole(value) {
    return String(value ?? '').trim().toUpperCase();
  }
  
  /**
   * Verifica si la sesión existe y si el rol del usuario está incluido
   * en la lista de roles permitidos (case-insensitive).
   *
   * @param {object|null} session - Objeto de sesión de NextAuth (o null)
   * @param {string[]|string} allowedRoles - Lista de roles permitidos (o un único rol)
   * @returns {{ ok: boolean, reason?: 'NO_SESSION'|'FORBIDDEN', role?: string }}
   */
  export function authorize(session, allowedRoles) {
    if (!session?.user) return { ok: false, reason: 'NO_SESSION' };
  
    const role = normalizeRole(session.user.role);
    const allowed = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
      .map(normalizeRole);
  
    if (!allowed.includes(role)) {
      return { ok: false, reason: 'FORBIDDEN', role };
    }
  
    return { ok: true, role };
  }
  