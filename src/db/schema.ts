import { pgTable, text, timestamp, boolean, integer, jsonb, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  domain: text('domain').notNull(),
  role: text('role').notNull().default('miembro'), // admin | jefe | miembro
  area: text('area'),
  createdAt: now('created_at'),
  lastSeenAt: now('last_seen_at'),
});

export const accounts = pgTable('accounts', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: ts('expires_at').notNull(),
  scope: text('scope').notNull(),
  labelMap: jsonb('label_map').$type<Record<string, string>>().notNull().default({}),
  updatedAt: now('updated_at'),
});

export type SlaTargets = { Clientes: number; Equipo: number; Proveedores: number };

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  sigNewId: text('sig_new_id'),
  sigReplyId: text('sig_reply_id'),
  slaTargets: jsonb('sla_targets').$type<SlaTargets>().notNull().default({ Clientes: 4, Equipo: 8, Proveedores: 24 }),
  slaBiz: boolean('sla_biz').notNull().default(true),
  vipEmails: text('vip_emails').array().notNull().default(sql`'{}'::text[]`),
  supplierDomains: text('supplier_domains').array().notNull().default(sql`'{}'::text[]`),
  orgMetrics: boolean('org_metrics').notNull().default(true),
  reopenRule: boolean('reopen_rule').notNull().default(true),
  groupBy: text('group_by').notNull().default('semana'),
});

export const threadStates = pgTable('thread_states', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull(),
  state: text('state').notNull().default('pendiente'),
  stateAt: now('state_at'),
  pinned: boolean('pinned').notNull().default(false),
  muted: boolean('muted').notNull().default(false),
  noReply: boolean('no_reply').notNull().default(false),
  snoozeUntil: ts('snooze_until'),
  followUpAt: ts('follow_up_at'),
  followUpNote: text('follow_up_note'),
  waitingSince: ts('waiting_since'),
}, (t) => [uniqueIndex('thread_states_user_thread').on(t.userId, t.threadId), index('thread_states_user_state').on(t.userId, t.state)]);

export type AiInsight = { summary: string; requests: string[]; commitments: string[]; priority: string; nextAction: string; model: string };

export const threadCache = pgTable('thread_cache', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  threadId: text('thread_id').notNull(),
  historyId: text('history_id').notNull(),
  subject: text('subject').notNull(),
  fromName: text('from_name').notNull(),
  fromEmail: text('from_email').notNull(),
  snippet: text('snippet').notNull(),
  date: ts('date').notNull(),
  labelIds: text('label_ids').array().notNull().default(sql`'{}'::text[]`),
  messageCount: integer('message_count').notNull(),
  lastFromMe: boolean('last_from_me').notNull(),
  toMe: boolean('to_me').notNull().default(true),
  ai: jsonb('ai').$type<AiInsight>(),
  updatedAt: now('updated_at'),
}, (t) => [primaryKey({ columns: [t.userId, t.threadId] }), index('thread_cache_user_date').on(t.userId, t.date)]);

export const signatures = pgTable('signatures', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('texto'), // texto | imagen | html
  body: text('body').notNull().default(''),
  html: text('html').notNull().default(''),
  imageData: text('image_data'),
  imageWidth: integer('image_width').notNull().default(120),
  imagePos: text('image_pos').notNull().default('izquierda'),
  createdAt: now('created_at'),
});

export const slaEvents = pgTable('sla_events', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(),
  threadId: text('thread_id').notNull(),
  receivedAt: ts('received_at').notNull(),
  repliedAt: ts('replied_at'),
  senderType: text('sender_type').notNull(),
  toMe: boolean('to_me').notNull().default(true),
}, (t) => [uniqueIndex('sla_events_user_msg').on(t.userId, t.messageId), index('sla_events_user_received').on(t.userId, t.receivedAt)]);

export const slaSync = pgTable('sla_sync', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  pending: jsonb('pending').$type<string[]>().notNull().default([]),
  processed: integer('processed').notNull().default(0),
  total: integer('total').notNull().default(0),
  status: text('status').notNull().default('idle'),
  lastRunAt: now('last_run_at'),
});

export const orgs = pgTable('orgs', {
  domain: text('domain').primaryKey(),
  name: text('name').notNull(),
  showNames: boolean('show_names').notNull().default(true),
  minGroup: boolean('min_group').notNull().default(true),
  perfVisibility: text('perf_visibility').notNull().default('jefes'),
  areas: text('areas').array().notNull().default(sql`'{}'::text[]`),
});

export const projects = pgTable('projects', {
  id: id(),
  domain: text('domain').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#1546C9'),
  createdById: text('created_by_id').notNull(),
  createdAt: now('created_at'),
});

export type CheckItem = { t: string; done: boolean };

export const tasks = pgTable('tasks', {
  id: id(),
  domain: text('domain').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull().default('hacer'), // hacer | curso | revision | hecho
  priority: text('priority').notNull().default('Media'),
  dueDate: text('due_date'), // YYYY-MM-DD
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  assigneeEmail: text('assignee_email').notNull(),
  createdById: text('created_by_id').notNull(),
  threadId: text('thread_id'),
  threadOwnerId: text('thread_owner_id'),
  threadSubject: text('thread_subject'),
  threadFrom: text('thread_from'),
  threadSummary: text('thread_summary'),
  shareEmail: boolean('share_email').notNull().default(false),
  checklist: jsonb('checklist').$type<CheckItem[]>().notNull().default([]),
  nudgedAt: ts('nudged_at'),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [index('tasks_domain_status').on(t.domain, t.status)]);

export const taskCollaborators = pgTable('task_collaborators', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
}, (t) => [primaryKey({ columns: [t.taskId, t.email] })]);

export const taskComments = pgTable('task_comments', {
  id: id(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorEmail: text('author_email').notNull(),
  body: text('body').notNull(),
  createdAt: now('created_at'),
});

export const taskActivity = pgTable('task_activity', {
  id: id(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: now('created_at'),
});
