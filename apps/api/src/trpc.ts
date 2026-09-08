import { initTRPC, TRPCError } from '@trpc/server';
import type { Repo, UserRec } from './types';

export interface Context {
  repo: Repo;
  user: UserRec | null;
  /** UTC day key for "today" — injectable for tests */
  today: string;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Requires a valid bearer token. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Leads and admins only (Team / Admin screens). */
export const leadProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === 'member' && !process.env.DAILYBEE_EVERYONE_IS_LEAD) throw new TRPCError({ code: 'FORBIDDEN', message: 'Lead or admin role required' });
  return next();
});
