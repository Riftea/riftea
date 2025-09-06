// src/lib/authz.js

export function normalizeRole(value) {
    return String(value ?? '').trim().toUpperCase();
  }
  
  // Evita mutaciones accidentales
  export const ROLES = Object.freeze({
    SUPERADMIN: 'SUPERADMIN',
    ADMIN: 'ADMIN',
    USER: 'USER',
  });
  
  // (Opcional) Jerarquía simple
  const ROLE_ORDER = {
    [ROLES.USER]: 1,
    [ROLES.ADMIN]: 2,
    [ROLES.SUPERADMIN]: 3,
  };
  
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
    const list = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles].filter(Boolean);
  
    // Blindaje: si no se pasó ningún rol permitido, negar por defecto.
    if (list.length === 0) return { ok: false, reason: 'FORBIDDEN', role };
  
    const allowed = list.map(normalizeRole);
    if (!allowed.includes(role)) {
      return { ok: false, reason: 'FORBIDDEN', role };
    }
    return { ok: true, role };
  }
  
  /**
   * Verifica si el usuario es ADMIN o SUPERADMIN
   * @param {object|null} session - Objeto de sesión de NextAuth
   * @returns {boolean}
   */
  export const isAdmin = (session) => {
    const role = normalizeRole(session?.user?.role);
    return role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
  };
  
  /**
   * Verifica si el usuario es SUPERADMIN
   * @param {object|null} session - Objeto de sesión de NextAuth
   * @returns {boolean}
   */
  export const isSuperAdmin = (session) => {
    const role = normalizeRole(session?.user?.role);
    return role === ROLES.SUPERADMIN;
  };
  
  /**
   * Verifica si el usuario es USER (rol básico)
   * @param {object|null} session - Objeto de sesión de NextAuth
   * @returns {boolean}
   */
  export const isUser = (session) => {
    const role = normalizeRole(session?.user?.role);
    return role === ROLES.USER;
  };
  
  /**
   * (Opcional) Verifica si el usuario tiene al menos el rol mínimo especificado
   * Útil para jerarquías: hasRoleAtLeast(session, ROLES.ADMIN) incluye ADMIN y SUPERADMIN
   * @param {object|null} session - Objeto de sesión de NextAuth
   * @param {string} minRole - Rol mínimo requerido
   * @returns {boolean}
   */
  export const hasRoleAtLeast = (session, minRole) => {
    const r = normalizeRole(session?.user?.role);
    const m = normalizeRole(minRole);
    return (ROLE_ORDER[r] ?? 0) >= (ROLE_ORDER[m] ?? 0);
  };
  
  /**
   * Obtiene el rol normalizado del usuario desde la sesión
   * @param {object|null} session - Objeto de sesión de NextAuth
   * @returns {string|null}
   */
  export const getUserRole = (session) => {
    if (!session?.user?.role) return null;
    return normalizeRole(session.user.role);
  };