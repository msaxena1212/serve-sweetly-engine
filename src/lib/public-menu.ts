import { createServerFn } from '@tanstack/react-start';

export const getPublicMenuFn = createServerFn({ method: 'GET' })
  .validator((data: { branchId?: string } | void) => data || {})
  .handler(async () => {
    const { getPublicMenuServer } = await import('./public-menu.server');
    return await getPublicMenuServer();
  });

