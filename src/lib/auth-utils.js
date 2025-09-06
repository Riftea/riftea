// src/lib/auth-utils.js - Utilities for NextAuth compatibility
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth.js';
import { NextResponse } from 'next/server';
import { normalizeRole } from '@/lib/authz';

/**
 * Get the current user session from NextAuth
 */
export async function getCurrentUser() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Require authentication - throw error if not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  return user;
}

/**
 * Require admin role - throw error if not admin/superadmin
 */
export async function requireAdmin() {
  const user = await requireAuth();
  const role = normalizeRole(user.role); // -> 'ADMIN' | 'SUPERADMIN' | ...
  if (role !== 'ADMIN' && role !== 'SUPERADMIN') {
    throw new Error('Admin access required');
  }
  return user;
}

/**
 * Create error response for API routes
 */
export function createErrorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Create success response for API routes
 */
export function createSuccessResponse(data, message = 'Success') {
  return NextResponse.json({ success: true, message, data });
}

/**
 * Wrapper for API routes that require authentication
 * Uso: export const POST = withAuth(async (req, { params, user }) => { ... })
 */
export function withAuth(handler) {
  return async (request, context = {}) => {
    try {
      const user = await requireAuth();
      return await handler(request, { ...context, user });
    } catch (error) {
      return createErrorResponse(error.message, 401);
    }
  };
}

/**
 * Wrapper for API routes that require admin access
 * Uso: export const POST = withAdmin(async (req, { params, user }) => { ... })
 */
export function withAdmin(handler) {
  return async (request, context = {}) => {
    try {
      const user = await requireAdmin();
      return await handler(request, { ...context, user });
    } catch (error) {
      const code = error.message === 'Authentication required' ? 401 : 403;
      return createErrorResponse(error.message, code);
    }
  };
}
