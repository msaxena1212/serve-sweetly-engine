// API Authentication & Authorization Middleware
import { verifyToken, type UserSession } from '../../lib/auth.server';

export interface AuthenticatedRequest extends Request {
  user?: UserSession;
}

export function parseCookie(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function authenticateApiRequest(request: Request): Promise<UserSession | null> {
  const authHeader = request.headers.get('authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    const cookieHeader = request.headers.get('cookie') || '';
    token = parseCookie(cookieHeader, 'session_token');
  }

  if (!token) return null;

  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export function requireRole(user: UserSession | null, allowedRoles: string[]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}
