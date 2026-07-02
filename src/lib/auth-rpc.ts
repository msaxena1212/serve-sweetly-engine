import { createServerFn } from '@tanstack/react-start';
import type { UserSession } from './auth.server';

export type { UserSession };

export const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getSessionServer } = await import('./auth.server');
  return await getSessionServer();
});

export const loginFn = createServerFn({ method: 'POST' })
  .validator((data: { pin: string }) => data)
  .handler(async ({ data }) => {
    const { loginServer } = await import('./auth.server');
    return await loginServer(data.pin);
  });

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { logoutServer } = await import('./auth.server');
  return await logoutServer();
});

export const getSessionServer = async () => {
  const { getSessionServer } = await import('./auth.server');
  return await getSessionServer();
};
