// src/lib/auth-utils.js - Utilities for NextAuth compatibility
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth.js';
import { NextResponse } from 'next/server';

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
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  return user;
}

/**
 * Require admin role - throw error if not admin
 */
export async function requireAdmin() {
  const user = await requireAuth();
  
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }
  
  return user;
}

/**
 * Create error response for API routes
 */
export function createErrorResponse(message, status = 400) {
  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

/**
 * Create success response for API routes
 */
export function createSuccessResponse(data, message = 'Success') {
  return NextResponse.json({
    success: true,
    message,
    data
  });
}

/**
 * Wrapper for API routes that require authentication
 */
export function withAuth(handler) {
  return async (request, context) => {
    try {
      const user = await requireAuth();
      request.user = user;
      return await handler(request, context);
    } catch (error) {
      return createErrorResponse(error.message, 401);
    }
  };
}

/**
 * Wrapper for API routes that require admin access
 */
export function withAdmin(handler) {
  return async (request, context) => {
    try {
      const user = await requireAdmin();
      request.user = user;
      return await handler(request, context);
    } catch (error) {
      return createErrorResponse(
        error.message, 
        error.message === 'Authentication required' ? 401 : 403
      );
    }
  };
}