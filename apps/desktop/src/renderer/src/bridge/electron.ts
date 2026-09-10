import type { Category } from '@dailybee/tracker/types';
import { CH, EV, type DailyBeeApi, type WindowState } from '@shared/api';
import type { AdminData, TeamData } from '@shared/team';
import type { AccountResult, AccountStatus, AppNotification, ProfilesStatus, ActivitySummary, Checkin, CheckinKind, DaySummary, DeepPartial, EndTaskResult, Entry, Project, RecategoriseTarget, ReportDraft, Session, SessionTask, Settings, SyncStatus, TaskRef, ToastMessage } from '@shared/types';
import type { PreloadBridge } from '../../../preload/api';

/** DailyBeeApi over the preload bridge (invoke + on). */
export function createElectronApi(b: PreloadBridge): DailyBeeApi {
  const inv = <T,>(ch: string, ...args: unknown[]) => b.invoke(ch, ...args) as Promise<T>;
  const on = <T,>(ev: string) => (cb: (v: T) => void) => b.on(ev, (p) => cb(p as T));
  return {
    platform: b.platform,
    demo: b.demo,
    session: {
      get: () => inv<Session>(CH.sessionGet),
      start: (t: SessionTask) => inv<Session>(CH.sessionStart, t),
      stop: (r: EndTaskResult) => inv<{ session: Session; entry: Entry }>(CH.sessionStop, r),
      onChange: on<Session>(EV.session),
    },
    entries: {
      list: (day?: string) => inv<Entry[]>(CH.entriesList, day),
      toggleDone: (id: string) => inv<Entry[]>(CH.entriesToggle, id),
      onChange: on<Entry[]>(EV.entries),
    },
    activity: {
      summary: () => inv<ActivitySummary>(CH.activitySummary),
      onChange: on<ActivitySummary>(EV.activity),
      recategorise: (target: RecategoriseTarget, cat: Category) => inv<ActivitySummary>(CH.activityRecategorise, target, cat),
      rules: () => inv(CH.activityRules),
      removeRule: (id: number) => inv(CH.activityRemoveRule, id),
    },
    checkins: {
      list: () => inv<Checkin[]>(CH.checkinsList),
      trigger: (kind?: CheckinKind) => inv<Checkin>(CH.checkinsTrigger, kind),
      answer: (id: string, answer: string) => inv<Checkin[]>(CH.checkinsAnswer, id, answer),
      onPrompt: on<Checkin | null>(EV.checkinPrompt),
      onChange: on<Checkin[]>(EV.checkins),
    },
    reports: {
      generate: (day?: string) => inv<ReportDraft>(CH.reportsGenerate, day),
      day: (day: string) => inv<DaySummary>(CH.reportsDay, day),
      current: () => inv<ReportDraft | null>(CH.reportsCurrent),
      save: (patch) => inv<ReportDraft>(CH.reportsSave, patch),
      send: () => inv(CH.reportsSend),
      history: () => inv(CH.reportsHistory),
      get: (day: string) => inv<ReportDraft | null>(CH.reportsGet, day),
    },
    settings: {
      get: () => inv<Settings>(CH.settingsGet),
      update: (patch: DeepPartial<Settings>) => inv<Settings>(CH.settingsUpdate, patch),
      onChange: on<Settings>(EV.settings),
      permissions: () => inv(CH.settingsPermissions),
      requestPermission: (id: string) => inv(CH.settingsRequestPermission, id),
      testCapture: () => inv(CH.settingsTestCapture),
    },
    data: {
      projects: () => inv<Project[]>(CH.dataProjects),
      saveProject: (p: Project) => inv<Project[]>(CH.dataSaveProject, p),
      removeProject: (id: string) => inv<{ ok: boolean; message: string; projects: Project[] }>(CH.dataRemoveProject, id),
      onProjects: on<Project[]>(EV.projects),
      tasks: () => inv<TaskRef[]>(CH.dataTasks),
      saveTask: (t: TaskRef) => inv<TaskRef[]>(CH.dataSaveTask, t),
    },
    team: {
      data: (range) => inv<TeamData>(CH.teamData, range),
      admin: (range, team) => inv<AdminData>(CH.teamAdmin, range, team),
      setPolicy: (rules) => inv<{ ok: boolean; message: string; policy: Array<[string, boolean]> }>(CH.teamSetPolicy, rules),
      nudge: (initials) => inv<{ ok: boolean; message: string }>(CH.teamNudge, initials),
    },
    sync: {
      status: () => inv<SyncStatus>(CH.syncStatus),
      pushNow: () => inv<SyncStatus>(CH.syncPush),
      onChange: on<SyncStatus>(EV.sync),
    },
    ui: {
      onToast: on<ToastMessage>(EV.toast),
      onNavigate: on<string>(EV.navigate),
      copyText: (text: string) => inv<void>(CH.uiCopy, text),
      openExternal: (url: string) => inv<void>(CH.uiOpenExternal, url),
      saveText: (name: string, text: string) => inv<boolean>(CH.uiSaveText, name, text),
    },
    account: {
      status: () => inv<AccountStatus>(CH.accountStatus),
      onChange: on<AccountStatus>(EV.account),
      setupSolo: (p) => inv<AccountStatus>(CH.accountSetupSolo, p),
      unlock: (password) => inv<AccountResult>(CH.accountUnlock, password),
      lock: () => inv<AccountStatus>(CH.accountLock),
      changePassword: (current, next) => inv<AccountResult>(CH.accountChangePassword, current, next),
      teamCreate: (p) => inv<AccountResult>(CH.accountTeamCreate, p),
      teamJoin: (p) => inv<AccountResult>(CH.accountTeamJoin, p),
      teamLogin: (p) => inv<AccountResult>(CH.accountTeamLogin, p),
      resetPassword: (next, answers) => inv<AccountResult>(CH.accountResetPassword, next, answers),
      checkRecovery: (answers) => inv<AccountResult>(CH.accountCheckRecovery, answers),
      setRecovery: (current, recovery) => inv<AccountResult>(CH.accountSetRecovery, current, recovery),
      checkServer: (apiUrl) => inv<AccountResult>(CH.accountCheckServer, apiUrl),
      finishTour: () => inv<AccountStatus>(CH.accountFinishTour),
    },
    profiles: {
      status: () => inv<ProfilesStatus>(CH.profilesStatus),
      onChange: on<ProfilesStatus>(EV.profiles),
      open: (id) => inv<ProfilesStatus>(CH.profilesOpen, id),
      create: () => inv<ProfilesStatus>(CH.profilesCreate),
      close: () => inv<ProfilesStatus>(CH.profilesClose),
      discard: () => inv<ProfilesStatus>(CH.profilesDiscard),
      remove: (id) => inv<ProfilesStatus>(CH.profilesRemove, id),
    },
    notifications: {
      list: () => inv<AppNotification[]>(CH.notificationsList),
      onChange: on<AppNotification[]>(EV.notifications),
      markRead: (ids) => inv<AppNotification[]>(CH.notificationsMarkRead, ids),
      clear: () => inv<AppNotification[]>(CH.notificationsClear),
    },
    window: {
      minimize: () => inv<void>(CH.windowMinimize),
      toggleMaximize: () => inv<void>(CH.windowToggleMaximize),
      close: () => inv<void>(CH.windowClose),
      state: () => inv<WindowState>(CH.windowState),
      onState: on<WindowState>(EV.windowState),
      showMain: () => inv<void>(CH.windowShowMain),
    },
  };
}
