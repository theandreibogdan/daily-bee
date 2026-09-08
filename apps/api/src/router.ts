import { z } from 'zod';
import { adminOverview, teamOverview } from './aggregate';
import { AdminRange, DayPush, PolicyRulesSchema, TeamRange } from './schemas';
import { addDays, weekStart } from './time';
import { createCallerFactory, leadProcedure, protectedProcedure, publicProcedure, router } from './trpc';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: 'dailybee-api', privacy: 'aggregates only — no URLs or window titles are accepted or stored' })),

  sync: router({
    /** One call per day per user; idempotent upsert of the day's aggregate. */
    pushDay: protectedProcedure.input(DayPush).mutation(async ({ ctx, input }) => {
      const user = await ctx.repo.updateProfile(ctx.user, input.user);
      await ctx.repo.saveDay(user, input);
      return { ok: true as const, day: input.day };
    }),
  }),

  team: router({
    overview: leadProcedure.input(z.object({ range: TeamRange })).query(async ({ ctx, input }) => {
      const today = ctx.today;
      const from = input.range === 'month' ? addDays(today, -30) : addDays(weekStart(today), -7);
      const snap = await ctx.repo.snapshot(ctx.user.workspaceId, from, today);
      return teamOverview(snap, today);
    }),
    nudge: leadProcedure.input(z.object({ initials: z.string().min(1).max(4) })).mutation(async ({ ctx, input }) => {
      await ctx.repo.addNudge(ctx.user, input.initials);
      return { ok: true as const };
    }),
  }),

  admin: router({
    overview: leadProcedure.input(z.object({ range: AdminRange, team: z.string().max(80).default('All teams') })).query(async ({ ctx, input }) => {
      const today = ctx.today;
      const span = input.range === 'week' ? 7 : input.range === 'month' ? 30 : 90;
      const snap = await ctx.repo.snapshot(ctx.user.workspaceId, addDays(today, -(span * 2)), today);
      return adminOverview(snap, today, input.range, input.team);
    }),
    policy: router({
      get: leadProcedure.query(async ({ ctx }) => (await ctx.repo.snapshot(ctx.user.workspaceId, ctx.today, ctx.today)).policy),
      set: leadProcedure.input(z.object({ rules: PolicyRulesSchema })).mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && !process.env.DAILYBEE_EVERYONE_IS_LEAD) throw new Error('Admin role required');
        return ctx.repo.setPolicy(ctx.user.workspaceId, input.rules);
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
