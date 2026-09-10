import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminOverview, teamOverview } from './aggregate';
import { hashPassword, initialsOf, newId, newInviteCode, slug, verifyPassword } from './auth';
import { AdminRange, CreateWorkspace, DayPush, JoinWorkspace, Login, PolicyRulesSchema, ProjectSchema, TeamRange } from './schemas';
import { addDays, weekStart } from './time';
import { createCallerFactory, leadProcedure, protectedProcedure, publicProcedure, router } from './trpc';
import type { UserRec, WorkspaceRec } from './types';
import { API_VERSION } from './version';

/** What the desktop keeps after signing in: a token plus who and where you are. */
const signedIn = (user: UserRec, ws: WorkspaceRec | null, token: string | null) => ({
  token,
  user: { id: user.id, name: user.name, email: user.email, initials: user.initials, team: user.team, role: user.role },
  workspace: ws ? { id: ws.id, name: ws.name, inviteCode: ws.inviteCode } : { id: user.workspaceId, name: user.team || 'Workspace', inviteCode: null },
});

export const appRouter = router({
  /** Liveness for load balancers, the desktop wizard and Docker: ok only while the store answers. */
  health: publicProcedure.query(async ({ ctx }) => {
    const dbOk = await ctx.repo.ping();
    return { ok: dbOk, service: 'dailybee-api', version: API_VERSION, db: ctx.repo.kind, dbOk, uptimeSeconds: Math.round(process.uptime()), privacy: 'aggregates only — no URLs or window titles are accepted or stored' };
  }),

  /** Accounts for Team use: the first admin creates a workspace, teammates join with its code, everyone signs in with email + password. */
  auth: router({
    createWorkspace: publicProcedure.input(CreateWorkspace).mutation(async ({ ctx, input }) => {
      if (await ctx.repo.userByEmail(input.email)) throw new TRPCError({ code: 'CONFLICT', message: 'An account with that email already exists — sign in instead' });
      const ws = await ctx.repo.createWorkspace({ id: `ws_${slug(input.workspaceName)}_${newId('').slice(1, 7)}`, name: input.workspaceName.trim(), inviteCode: newInviteCode() });
      const user = await ctx.repo.createUser({ id: newId('u'), workspaceId: ws.id, email: input.email.trim().toLowerCase(), name: input.name.trim(), initials: initialsOf(input.name), team: ws.name, role: 'admin', createdAt: Date.now(), passwordHash: hashPassword(input.password) });
      return signedIn(user, ws, await ctx.repo.issueToken(user.id, 'desktop'));
    }),
    join: publicProcedure.input(JoinWorkspace).mutation(async ({ ctx, input }) => {
      const ws = await ctx.repo.workspaceByInvite(input.inviteCode);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'No workspace has that join code' });
      if (await ctx.repo.userByEmail(input.email)) throw new TRPCError({ code: 'CONFLICT', message: 'An account with that email already exists — sign in instead' });
      const user = await ctx.repo.createUser({ id: newId('u'), workspaceId: ws.id, email: input.email.trim().toLowerCase(), name: input.name.trim(), initials: initialsOf(input.name), team: ws.name, role: 'member', createdAt: Date.now(), passwordHash: hashPassword(input.password) });
      return signedIn(user, ws, await ctx.repo.issueToken(user.id, 'desktop'));
    }),
    login: publicProcedure.input(Login).mutation(async ({ ctx, input }) => {
      const user = await ctx.repo.userByEmail(input.email);
      if (!user || !verifyPassword(input.password, user.passwordHash)) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Wrong email or password' });
      return signedIn(user, await ctx.repo.workspace(user.workspaceId), await ctx.repo.issueToken(user.id, 'desktop'));
    }),
    me: protectedProcedure.query(async ({ ctx }) => signedIn(ctx.user, await ctx.repo.workspace(ctx.user.workspaceId), null)),
  }),

  sync: router({
    /** One call per day per user; idempotent upsert of the day's aggregate. */
    pushDay: protectedProcedure.input(DayPush).mutation(async ({ ctx, input }) => {
      const user = await ctx.repo.updateProfile(ctx.user, input.user);
      await ctx.repo.saveDay(user, input);
      return { ok: true as const, day: input.day };
    }),
    /** The workspace's project registry, readable by every member (admins edit it under admin.projects). */
    projects: protectedProcedure.query(({ ctx }) => ctx.repo.projects(ctx.user.workspaceId)),
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
    /** The workspace's project registry (names, colours, weekly budgets) — the desktop mirrors it into its pickers. */
    projects: router({
      list: leadProcedure.query(({ ctx }) => ctx.repo.projects(ctx.user.workspaceId)),
      save: leadProcedure.input(ProjectSchema).mutation(({ ctx, input }) => ctx.repo.saveProject(ctx.user.workspaceId, input)),
      remove: leadProcedure.input(z.object({ id: z.string().min(1).max(40) })).mutation(({ ctx, input }) => ctx.repo.removeProject(ctx.user.workspaceId, input.id)),
    }),
  }),
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
