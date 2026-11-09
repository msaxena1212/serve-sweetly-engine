import { SignJWT, jwtVerify } from 'jose';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { db } from './db/db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-jwt-key');

export type UserSession = {
  id: number;
  name: string;
  role: string;
};

export async function signToken(payload: UserSession) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserSession;
  } catch (error) {
    return null;
  }
}

export async function getSessionServer() {
  const token = getCookie('session_token');
  if (!token) return null;
  
  return await verifyToken(token);
}

export function createSessionCookie(token: string) {
  setCookie('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day
  });
}

export function clearSessionCookie() {
  setCookie('session_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function loginServer(pin: string) {
  const userResult = await db.select().from(users).where(eq(users.pin, pin)).limit(1);
  const user = userResult[0];

  if (!user) {
    throw new Error('Invalid PIN');
  }

  const token = await signToken({
    id: user.id,
    name: user.name,
    role: user.role,
  });

  createSessionCookie(token);

  return { success: true, role: user.role, token, user: { id: user.id, name: user.name, role: user.role } };
}

export async function logoutServer() {
  clearSessionCookie();
  return { success: true };
}
