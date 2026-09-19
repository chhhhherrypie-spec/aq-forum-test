import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
const id = () => text('id').primaryKey();
const created = () => text('created_at').notNull();
export const users = sqliteTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    username_key: text('username_key').notNull(),
    email: text('email').notNull(),
    password_hash: text('password_hash').notNull(),
    avatar: text('avatar'),
    points: integer('points').notNull().default(0),
    role: text('role').notNull().default('user'),
    account_status: text('account_status').notNull().default('active'),
    banned_until: text('banned_until'),
    ban_reason: text('ban_reason'),
    created_at: created(),
    last_login_at: text('last_login_at'),
  },
  (t) => [
    uniqueIndex('users_username_key').on(t.username_key),
    uniqueIndex('users_email').on(t.email),
  ],
);
export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    expires_at: text('expires_at').notNull(),
  },
  (t) => [index('sessions_user').on(t.user_id)],
);
export const settings = sqliteTable('settings', {
  id: id(),
  value: text('value').notNull(),
});
export const quizQuestions = sqliteTable('quiz_questions', {
  id: id(),
  question: text('question').notNull(),
  type: text('type').notNull().default('text'),
  options: text('options'),
  correct_answer: text('correct_answer').notNull(),
  score: integer('score').notNull().default(10),
  sort_order: integer('sort_order').notNull().default(0),
  status: text('status').notNull().default('active'),
});
export const quizAttempts = sqliteTable('quiz_attempts', {
  id: id(),
  question_ids: text('question_ids').notNull(),
  passed: integer('passed').notNull().default(0),
  consumed: integer('consumed').notNull().default(0),
  expires_at: text('expires_at').notNull(),
});
export const posts = sqliteTable(
  'posts',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    category: text('category').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    tags: text('tags').notNull().default('[]'),
    status: text('status').notNull().default('published'),
    pinned: integer('pinned').notNull().default(0),
    fingerprint: text('fingerprint').notNull(),
    created_at: created(),
    updated_at: text('updated_at').notNull(),
    view_count: integer('view_count').notNull().default(0),
    comment_count: integer('comment_count').notNull().default(0),
    points_awarded: integer('points_awarded').notNull().default(0),
  },
  (t) => [
    index('posts_feed').on(t.status, t.category, t.created_at),
    index('posts_author_hash').on(t.user_id, t.fingerprint),
  ],
);
export const media = sqliteTable(
  'media',
  {
    id: id(),
    post_id: text('post_id').references(() => posts.id),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    media_type: text('media_type').notNull(),
    file_url: text('file_url').notNull(),
    thumbnail_url: text('thumbnail_url'),
    cover_id: text('cover_id'),
    file_size: integer('file_size').notNull(),
    mime: text('mime').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('uploading'),
    upload_id: text('upload_id'),
    fingerprint: text('fingerprint'),
    created_at: created(),
  },
  (t) => [index('media_post').on(t.post_id)],
);
export const mediaParts = sqliteTable(
  'media_parts',
  {
    id: id(),
    media_id: text('media_id')
      .notNull()
      .references(() => media.id),
    part_number: integer('part_number').notNull(),
    etag: text('etag').notNull(),
    digest: text('digest').notNull(),
    size: integer('size').notNull(),
  },
  (t) => [uniqueIndex('media_parts_unique').on(t.media_id, t.part_number)],
);
export const blocks = sqliteTable(
  'post_content_blocks',
  {
    id: id(),
    post_id: text('post_id')
      .notNull()
      .references(() => posts.id),
    block_type: text('block_type').notNull(),
    content: text('content'),
    media_id: text('media_id').references(() => media.id),
    sort_order: integer('sort_order').notNull(),
    is_locked: integer('is_locked').notNull().default(0),
    required_points: integer('required_points').notNull().default(30),
    created_at: created(),
    updated_at: text('updated_at').notNull(),
  },
  (t) => [index('blocks_post_sort').on(t.post_id, t.sort_order)],
);
export const comments = sqliteTable(
  'comments',
  {
    id: id(),
    post_id: text('post_id')
      .notNull()
      .references(() => posts.id),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    fingerprint: text('fingerprint').notNull(),
    effective_character_count: integer('effective_character_count').notNull(),
    points_awarded: integer('points_awarded').notNull().default(0),
    status: text('status').notNull().default('published'),
    created_at: created(),
  },
  (t) => [
    index('comments_post').on(t.post_id, t.status, t.created_at),
    index('comments_duplicate').on(t.user_id, t.fingerprint, t.created_at),
  ],
);
export const transactions = sqliteTable(
  'point_transactions',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    balance_after: integer('balance_after').notNull().default(0),
    type: text('type').notNull(),
    source_id: text('source_id').notNull(),
    created_at: created(),
    reward_date: text('reward_date').notNull(),
  },
  (t) => [
    uniqueIndex('points_source_once').on(t.user_id, t.type, t.source_id),
    index('points_daily').on(t.user_id, t.reward_date, t.type),
  ],
);
export const checkIns = sqliteTable(
  'check_ins',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    check_in_date: text('check_in_date').notNull(),
    points_awarded: integer('points_awarded').notNull(),
  },
  (t) => [uniqueIndex('checkin_user_day').on(t.user_id, t.check_in_date)],
);
export const bans = sqliteTable(
  'bans',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    admin_id: text('admin_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    start_at: text('start_at').notNull(),
    end_at: text('end_at'),
    status: text('status').notNull().default('active'),
  },
  (t) => [index('bans_user_active').on(t.user_id, t.status, t.start_at)],
);
export const adminLogs = sqliteTable('admin_logs', {
  id: id(),
  admin_id: text('admin_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  target_type: text('target_type').notNull(),
  target_id: text('target_id').notNull(),
  detail: text('detail').notNull(),
  created_at: created(),
});
export const likes = sqliteTable(
  'likes',
  {
    id: id(),
    post_id: text('post_id')
      .notNull()
      .references(() => posts.id),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [uniqueIndex('likes_once').on(t.post_id, t.user_id)],
);
export const limits = sqliteTable('rate_limits', {
  id: id(),
  count: integer('count').notNull(),
  expires_at: text('expires_at').notNull(),
});
export const contentFingerprints = sqliteTable(
  'content_fingerprints',
  {
    id: id(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id),
    fingerprint: text('fingerprint').notNull(),
    created_at: created(),
  },
  (t) => [
    uniqueIndex('content_fingerprints_user_hash').on(t.user_id, t.fingerprint),
  ],
);
