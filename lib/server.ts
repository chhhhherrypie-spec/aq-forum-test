import { validateStoredMedia } from './media-validation';
import { defaults, effective, normalize, messages, categories } from './config';
export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_SETUP_TOKEN?: string;
  ADMIN_EMAIL?: string;
};
export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public detail?: any,
  ) {
    super(code);
  }
}
export const fail = (c: string, s = 400, d?: any): never => {
  throw new AppError(c, s, d);
};
export const now = () => new Date().toISOString();
export const day = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
export const uid = () => crypto.randomUUID();
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
export const digest = async (s: string | ArrayBuffer) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        typeof s === 'string' ? new TextEncoder().encode(s) : s,
      ),
    ),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
export async function password(p: string, salt = token()) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const h = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return `pbkdf2$100000$${salt}$${Array.from(new Uint8Array(h), (v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export async function matches(p: string, h: string) {
  const v = await password(p, h.split('$')[2]);
  let x = v.length ^ h.length;
  for (let i = 0; i < v.length; i++) x |= v.charCodeAt(i) ^ h.charCodeAt(i);
  return x === 0;
}
export const cookie = (req: Request, name: string) =>
  req.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1) || '';
export function setCookie(
  req: Request,
  name: string,
  value: string,
  age: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export const json = (data: any, status = 200, headers: any = {}) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      ...headers,
    },
  });
export function service(env: Env) {
  const db = env.DB;
  const q = (sql: string, ...v: any[]) => db.prepare(sql).bind(...v);
  const one = async (sql: string, ...v: any[]) => q(sql, ...v).first<any>();
  const rows = async (sql: string, ...v: any[]) =>
    (await q(sql, ...v).all<any>()).results;
  async function init() {
    await db.batch([
      q(
        "INSERT OR IGNORE INTO quiz_questions (id,question,type,correct_answer,score,sort_order,status) SELECT 'default','aq面对面建群的数字是？','text','1452',10,0,'active' WHERE NOT EXISTS(SELECT 1 FROM settings WHERE id='config')",
      ),
      q(
        "INSERT OR IGNORE INTO settings(id,value) VALUES('config',?)",
        JSON.stringify(defaults),
      ),
    ]);
  }
  async function config() {
    return {
      ...defaults,
      ...JSON.parse(
        (await one("SELECT value FROM settings WHERE id='config'")).value,
      ),
    };
  }
  async function user(req: Request, required = true, allowBanned = false) {
    const sid = cookie(req, 'forum_session');
    const u = sid
      ? await one(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?',
          await digest(sid),
          now(),
        )
      : null;
    if (!u) {
      if (required) fail('UNAUTHORIZED', 401);
      return null;
    }
    const b = await one(
      "SELECT * FROM bans WHERE user_id=? AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?) ORDER BY start_at DESC LIMIT 1",
      u.id,
      now(),
      now(),
    );
    u.ban = b || null;
    u.account_status = b ? 'banned' : 'active';
    u.ban_reason = b?.reason || null;
    u.banned_until = b?.end_at || null;
    if (b && !allowBanned)
      fail('ACCOUNT_BANNED', 403, { reason: b.reason, end_at: b.end_at });
    return u;
  }
  function publicUser(u: any, viewer?: any) {
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar ? `/api/media/${u.avatar}` : null,
      points: u.points,
      effective_points: Math.max(0, u.points),
      role: u.role,
      created_at: u.created_at,
      account_status: u.account_status,
      ...(viewer && (viewer.id === u.id || viewer.role === 'admin')
        ? {
            email: u.email,
            last_login_at: u.last_login_at,
            ban_reason: u.ban_reason,
            banned_until: u.banned_until,
          }
        : {}),
    };
  }
  function permissions(u: any, c: any) {
    return {
      post: u.role === 'admin' || u.points >= c.post_threshold,
      comment: u.role === 'admin' || u.points >= c.comment_threshold,
      locked: u.role === 'admin' || u.points >= c.locked_threshold,
    };
  }
  function requirePoints(u: any, c: any, t: 'post' | 'comment') {
    if (!permissions(u, c)[t])
      fail(
        t === 'post' ? 'POST_PERMISSION_DENIED' : 'COMMENT_PERMISSION_DENIED',
        403,
        { required_points: c[t + '_threshold'], current_points: u.points },
      );
  }
  const admin = (u: any) => {
    if (u.role !== 'admin') fail('FORBIDDEN', 403);
  };
  function audit(
    u: any,
    action: string,
    targetType: string,
    targetId: string,
    detail: any,
  ) {
    return q(
      'INSERT INTO admin_logs(id,admin_id,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?,?)',
      uid(),
      u.id,
      action,
      targetType,
      targetId,
      JSON.stringify(detail),
      now(),
    );
  }
  async function rate(req: Request, key: string, max: number) {
    const at = now(),
      minute = at.slice(0, 16);
    const id = await digest(
      `${req.headers.get('cf-connecting-ip') || 'local'}:${key}:${minute}`,
    );
    await q('DELETE FROM rate_limits WHERE expires_at<?', at).run();
    const r = await one(
      'INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
      id,
      new Date(Date.now() + 120000).toISOString(),
    );
    if (r.count > max) fail('RATE_LIMITED', 429);
  }
  async function body(req: Request) {
    const reader = req.body?.getReader();
    if (!reader) fail('INVALID_REQUEST');
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      length += value.length;
      if (length > 1024 * 1024) {
        await reader!.cancel();
        fail('REQUEST_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
    const all = new Uint8Array(length);
    let offset = 0;
    for (const x of chunks) {
      all.set(x, offset);
      offset += x.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(all));
    } catch {
      fail('INVALID_REQUEST');
    }
  }
  function validateAccount(b: any) {
    if (!/^[a-zA-Z0-9]{3,20}$/.test(b.username || '')) fail('INVALID_USERNAME');
    if (
      typeof b.email !== 'string' ||
      b.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
    )
      fail('INVALID_EMAIL');
    if (typeof b.password !== 'string' || b.password.length < 8)
      fail('PASSWORD_TOO_SHORT');
    if (
      b.password.length > 256 ||
      !/[a-zA-Z]/.test(b.password) ||
      !/[0-9]/.test(b.password)
    )
      fail('WEAK_PASSWORD');
    if (b.password !== b.confirmPassword) fail('PASSWORD_NOT_MATCH');
  }
  async function sessionStatements(id: string) {
    const s = token();
    return {
      token: s,
      statement: q(
        'INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)',
        await digest(s),
        id,
        new Date(Date.now() + 7 * 86400000).toISOString(),
      ),
    };
  }
  function rollback(u: string, type: string, id: string) {
    return q(
      'INSERT OR IGNORE INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) SELECT ?,user_id,-amount,?,source_id,?,? FROM point_transactions WHERE user_id=? AND source_id=? AND type=? AND amount>0',
      uid(),
      type + '_rollback',
      now(),
      day(),
      u,
      id,
      type,
    );
  }
  async function serializePost(
    p: any,
    u: any,
    c: any,
    detail = false,
    commentOffset = 0,
  ) {
    const out: any = {
      id: p.id,
      title: p.title,
      category: p.category,
      tags: JSON.parse(p.tags),
      created_at: p.created_at,
      updated_at: p.updated_at,
      view_count: p.view_count,
      comment_count: p.comment_count,
      pinned: !!p.pinned,
      status: p.status,
      points_awarded: p.points_awarded,
      author: {
        id: p.user_id,
        username: p.username,
        avatar: p.avatar ? `/api/media/${p.avatar}` : null,
      },
      like_count: (
        await one('SELECT count(*) n FROM likes WHERE post_id=?', p.id)
      ).n,
    };
    if (u.role === 'admin') {
      out.author.email = p.email;
      out.author.account_status = (
        await one(
          "SELECT count(*) n FROM bans WHERE user_id=? AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?)",
          p.user_id,
          now(),
          now(),
        )
      ).n
        ? 'banned'
        : 'active';
    }
    const b = await rows(
      'SELECT b.*,m.media_type,m.cover_id FROM post_content_blocks b LEFT JOIN media m ON b.media_id=m.id WHERE b.post_id=? ORDER BY sort_order',
      p.id,
    );
    const can =
      u.role === 'admin' ||
      u.id === p.user_id ||
      u.points >= c.locked_threshold;
    out.has_locked = b.some((v) => v.is_locked);
    out.excerpt = b
      .filter((v) => !v.is_locked && v.block_type === 'text')
      .map((v) => v.content)
      .join('\n')
      .slice(0, 180);
    out.cover = b.find(
      (v) =>
        !v.is_locked && (v.block_type === 'image' || v.block_type === 'video'),
    )?.media_id;
    out.cover = out.cover ? `/api/media/${out.cover}` : null;
    out.cover_type = b.find(
      (v) =>
        !v.is_locked && (v.block_type === 'image' || v.block_type === 'video'),
    )?.block_type;
    out.thumbnail = b.find((v) => !v.is_locked && v.cover_id)?.cover_id;
    out.thumbnail = out.thumbnail ? `/api/media/${out.thumbnail}` : null;
    if (detail) {
      out.blocks = b.map((v) =>
        v.is_locked && !can
          ? {
              id: v.id,
              locked: true,
              code: 'LOCKED_CONTENT',
              required_points: c.locked_threshold,
              current_points: Math.max(0, u.points),
              points_needed: Math.max(0, c.locked_threshold - u.points),
            }
          : {
              id: v.id,
              block_type: v.block_type,
              content: v.content,
              media_id: v.media_id,
              is_locked: !!v.is_locked,
              required_points: c.locked_threshold,
              url: v.media_id ? `/api/media/${v.media_id}` : null,
              cover_url: v.cover_id ? `/api/media/${v.cover_id}` : null,
            },
      );
      out.liked = !!(await one(
        'SELECT id FROM likes WHERE post_id=? AND user_id=?',
        p.id,
        u.id,
      ));
      out.comments = (
        await rows(
          "SELECT c.*,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE post_id=? AND c.status='published' ORDER BY c.created_at LIMIT 50 OFFSET ?",
          p.id,
          commentOffset,
        )
      ).map((v) => ({
        id: v.id,
        user_id: v.user_id,
        username: v.username,
        avatar: v.avatar ? `/api/media/${v.avatar}` : null,
        content: v.content,
        created_at: v.created_at,
        points_awarded: v.points_awarded,
      }));
    }
    return out;
  }
  const postQuery =
    'SELECT p.*,u.username,u.avatar,u.email FROM posts p JOIN users u ON u.id=p.user_id';
  async function getPost(id: string, u: any) {
    const p = await one(postQuery + ' WHERE p.id=?', id);
    if (
      !p ||
      (p.status !== 'published' && u.role !== 'admin' && u.id !== p.user_id)
    )
      fail('NOT_FOUND', 404);
    return p;
  }
  async function validatePost(b: any, u: any, c: any, id?: string) {
    if (!categories[b.category]) fail('INVALID_CATEGORY');
    if (typeof b.title !== 'string' || !b.title.trim()) fail('EMPTY_TITLE');
    if (b.title.length > 160) fail('TITLE_TOO_LONG');
    if (!Array.isArray(b.blocks) || b.blocks.length > 100)
      fail('INVALID_CONTENT');
    const ms: any[] = [];
    let chars = 0,
      totalchars = 0,
      publicImages = 0,
      images = 0,
      videos = 0;
    const old = id
      ? await rows(
          'SELECT id,is_locked FROM post_content_blocks WHERE post_id=?',
          id,
        )
      : [];
    for (const v of b.blocks) {
      if (!['text', 'image', 'video'].includes(v.block_type))
        fail('INVALID_CONTENT');
      v.is_locked = !!v.is_locked;
      if (v.block_type === 'video' && b.category !== 'video')
        fail('INVALID_CATEGORY');
      if (
        v.block_type !== 'text' &&
        v.content !== undefined &&
        (typeof v.content !== 'string' || v.content.length > 10000)
      )
        fail('INVALID_CONTENT');
      if (
        v.is_locked &&
        (!c.locked_enabled || !c.locked_categories.includes(b.category)) &&
        !old.find((x) => x.id === v.id && x.is_locked)
      )
        fail('LOCKED_NOT_ALLOWED');
      if (v.is_locked && !['article', 'image'].includes(b.category))
        fail('LOCKED_NOT_ALLOWED');
      if (v.block_type === 'text') {
        if (typeof v.content !== 'string' || v.content.length > 100000)
          fail('INVALID_CONTENT');
        totalchars += effective(v.content);
        if (!v.is_locked) chars += effective(v.content);
      } else {
        const m = await one(
          "SELECT * FROM media WHERE id=? AND status='ready'",
          v.media_id,
        );
        if (
          !m ||
          (m.user_id !== u.id && u.role !== 'admin') ||
          (m.post_id && m.post_id !== id) ||
          m.media_type !== v.block_type
        )
          fail('UPLOAD_FAILED');
        if (ms.some((x) => x.id === m.id)) fail('INVALID_CONTENT');
        if (m.cover_id) {
          const cover = await one(
            "SELECT * FROM media WHERE id=? AND status='ready' AND media_type='image'",
            m.cover_id,
          );
          if (
            !cover ||
            cover.user_id !== m.user_id ||
            (cover.post_id && cover.post_id !== id) ||
            (await one('SELECT id FROM users WHERE avatar=?', cover.id))
          )
            fail('UPLOAD_FAILED');
        }
        if (await one('SELECT id FROM users WHERE avatar=?', m.id))
          fail('UPLOAD_FAILED');
        ms.push(m);
        if (v.block_type === 'image') {
          images++;
          if (!v.is_locked) publicImages++;
        } else videos++;
      }
    }
    const coverIds = ms.filter((m) => m.cover_id).map((m) => m.cover_id);
    if (
      coverIds.some((id) => ms.some((m) => m.id === id)) ||
      new Set(coverIds).size !== coverIds.length
    )
      fail('UPLOAD_FAILED');
    if (b.category === 'article' && !totalchars) fail('EMPTY_CONTENT');
    if (b.category === 'image' && !images) fail('IMAGE_REQUIRED');
    if (b.category === 'image' && !chars) fail('EMPTY_CONTENT');
    if (b.category === 'video' && !videos) fail('VIDEO_REQUIRED');
    if (b.category === 'chat' && !totalchars && !images) fail('EMPTY_CONTENT');
    if (images > c.image_max_count) fail('TOO_MANY_IMAGES');
    if (videos > c.video_max_count) fail('TOO_MANY_VIDEOS');
    if (b.blocks.some((v: any) => v.is_locked)) {
      if (b.category === 'article' && chars < c.min_public_chars)
        fail('PUBLIC_CONTENT_TOO_SHORT', 400, { required: c.min_public_chars });
      if (b.category === 'image' && publicImages < c.min_public_images)
        fail('PUBLIC_IMAGE_REQUIRED', 400, { required: c.min_public_images });
    }
    if (totalchars > 200000) fail('CONTENT_TOO_LONG');
    const tags = Array.isArray(b.tags)
      ? b.tags
          .map(String)
          .slice(0, 8)
          .map((x: string) => x.slice(0, 20))
      : [];
    const fingerprint = await digest(
      normalize(
        b.blocks
          .filter((x: any) => x.block_type === 'text')
          .map((x: any) => x.content)
          .join(''),
      ) +
        ms
          .map((x) => x.fingerprint)
          .sort()
          .join('|'),
    );
    return { ms, tags, fingerprint };
  }
  function blockStatements(b: any, id: string, c: any, at: string) {
    return b.blocks.map((v: any, i: number) =>
      q(
        'INSERT INTO post_content_blocks(id,post_id,block_type,content,media_id,sort_order,is_locked,required_points,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        uid(),
        id,
        v.block_type,
        v.content || null,
        v.media_id || null,
        i,
        v.is_locked ? 1 : 0,
        c.locked_threshold,
        at,
        at,
      ),
    );
  }
  async function mediaAccess(id: string, u: any, c: any) {
    const m = await one(
      "SELECT * FROM media WHERE id=? AND status='ready'",
      id,
    );
    if (!m) fail('NOT_FOUND', 404);
    if (m.post_id) {
      const p = await getPost(m.post_id, u);
      const linked = await rows(
        'SELECT b.is_locked FROM post_content_blocks b LEFT JOIN media v ON v.id=b.media_id WHERE b.post_id=? AND (b.media_id=? OR v.cover_id=?)',
        p.id,
        id,
        id,
      );
      if (!linked.length && u.id !== m.user_id && u.role !== 'admin')
        fail('NOT_FOUND', 404);
      if (
        linked.some((x) => x.is_locked) &&
        u.role !== 'admin' &&
        u.id !== p.user_id &&
        u.points < c.locked_threshold
      )
        fail('LOCKED_CONTENT_PERMISSION_DENIED', 403);
    } else if (
      u.id !== m.user_id &&
      u.role !== 'admin' &&
      !(await one('SELECT id FROM users WHERE avatar=?', id))
    )
      fail('FORBIDDEN', 403);
    return m;
  }
  async function handle(req: Request) {
    try {
      await init();
      const url = new URL(req.url);
      const path = url.pathname.slice(5).replace(/\/$/, '');
      const parts = path.split('/');
      const method = req.method;
      const offset = Math.max(
        0,
        Math.floor(Number(url.searchParams.get('offset')) || 0),
      );
      const c = await config();
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers.get('x-forum-request') !== '1') fail('FORBIDDEN', 403);
        const origin = req.headers.get('origin');
        if (origin && origin !== url.origin) fail('FORBIDDEN', 403);
      }
      if (path === 'quiz/start' && method === 'POST') {
        await rate(req, 'quiz_start', 30);
        const qs = await rows(
          "SELECT id,question,type,score FROM quiz_questions WHERE status='active' ORDER BY random() LIMIT ?",
          c.quiz_draw_count,
        );
        if (
          !qs.length ||
          qs.reduce((n, x) => n + x.score, 0) < c.quiz_pass_score
        )
          fail('INVALID_SETTINGS');
        const t = token();
        await q(
          'INSERT INTO quiz_attempts(id,question_ids,expires_at) VALUES(?,?,?)',
          await digest(t),
          JSON.stringify(qs.map((x) => x.id)),
          new Date(Date.now() + 1800000).toISOString(),
        ).run();
        return json({ questions: qs, pass_score: c.quiz_pass_score }, 200, {
          'Set-Cookie': setCookie(req, 'forum_quiz', t, 1800),
        });
      }
      if (path === 'quiz' && method === 'POST') {
        await rate(req, 'quiz_answer', 10);
        const a = await one(
          'SELECT * FROM quiz_attempts WHERE id=? AND expires_at>? AND consumed=0',
          await digest(cookie(req, 'forum_quiz')),
          now(),
        );
        if (!a) fail('QUIZ_NOT_PASSED', 403);
        const b = await body(req);
        const ids = JSON.parse(a.question_ids);
        if (
          ids.some(
            (id: string) =>
              typeof b.answers?.[id] !== 'string' || !b.answers[id].trim(),
          )
        )
          fail('INCOMPLETE_QUIZ');
        let score = 0;
        for (const id of ids) {
          const v = await one(
            "SELECT * FROM quiz_questions WHERE id=? AND status='active'",
            id,
          );
          if (!v) fail('QUIZ_NOT_PASSED');
          if (
            b.answers[id].trim().normalize('NFKC') ===
            v.correct_answer.trim().normalize('NFKC')
          )
            score += v.score;
        }
        const passed = score >= c.quiz_pass_score;
        await q(
          'UPDATE quiz_attempts SET passed=?,expires_at=? WHERE id=?',
          passed ? 1 : 0,
          new Date(Date.now() + 1800000).toISOString(),
          a.id,
        ).run();
        return json(
          {
            code: passed ? 'PASS' : 'FAIL',
            score,
            message: passed ? '验证通过' : messages.FAIL,
          },
          passed ? 200 : 400,
        );
      }
      if (path === 'auth/register' || path === 'auth/setup') {
        if (method !== 'POST') fail('NOT_FOUND', 404);
        await rate(req, 'register', 6);
        const b = await body(req);
        const setup = path === 'auth/setup';
        let a: any;
        if (setup) {
          if (
            !env.ADMIN_SETUP_TOKEN ||
            b.setup_token !== env.ADMIN_SETUP_TOKEN ||
            b.email?.toLowerCase() !== env.ADMIN_EMAIL?.toLowerCase() ||
            (await one("SELECT id FROM settings WHERE id='admin_initialized'"))
          )
            fail('SETUP_DISABLED', 403);
        } else {
          a = await one(
            'SELECT * FROM quiz_attempts WHERE id=? AND passed=1 AND consumed=0 AND expires_at>?',
            await digest(cookie(req, 'forum_quiz')),
            now(),
          );
          if (!a) fail('QUIZ_NOT_PASSED', 403);
        }
        validateAccount(b);
        if (
          await one(
            'SELECT id FROM users WHERE username_key=?',
            b.username.toLowerCase(),
          )
        )
          fail('USERNAME_EXISTS');
        if (
          await one('SELECT id FROM users WHERE email=?', b.email.toLowerCase())
        )
          fail('EMAIL_EXISTS');
        const id = uid(),
          hash = await password(b.password),
          s = await sessionStatements(id),
          at = now();
        const statements = setup
          ? [
              q(
                "INSERT INTO settings(id,value) VALUES('admin_initialized','true')",
              ),
              q(
                "INSERT INTO users(id,username,username_key,email,password_hash,role,created_at,last_login_at) VALUES(?,?,?,?,?,'admin',?,?)",
                id,
                b.username,
                b.username.toLowerCase(),
                b.email.toLowerCase(),
                hash,
                at,
                at,
              ),
            ]
          : [
              q(
                'INSERT INTO users(id,username,username_key,email,password_hash,created_at,last_login_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quiz_attempts WHERE id=? AND consumed=0 AND passed=1 AND expires_at>?)',
                id,
                b.username,
                b.username.toLowerCase(),
                b.email.toLowerCase(),
                hash,
                at,
                at,
                a.id,
                at,
              ),
              q('UPDATE quiz_attempts SET consumed=1 WHERE id=?', a.id),
            ];
        await db.batch([...statements, s.statement]);
        return json({ code: 'USER_CREATED', user_id: id }, 201, {
          'Set-Cookie': setCookie(req, 'forum_session', s.token, 604800),
        });
      }
      if (path === 'auth/login' && method === 'POST') {
        await rate(req, 'login', 10);
        const b = await body(req);
        const u = await one(
          'SELECT * FROM users WHERE username_key=? OR email=?',
          String(b.login || '').toLowerCase(),
          String(b.login || '').toLowerCase(),
        );
        if (!u) fail('USER_NOT_FOUND', 404);
        if (
          typeof b.password !== 'string' ||
          b.password.length > 256 ||
          !(await matches(b.password, u.password_hash))
        )
          fail('WRONG_PASSWORD', 401);
        const ban = await one(
          "SELECT * FROM bans WHERE user_id=? AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?)",
          u.id,
          now(),
          now(),
        );
        if (ban && c.ban_login_mode === 'deny')
          fail('ACCOUNT_BANNED', 403, { reason: ban.reason });
        const s = await sessionStatements(u.id);
        await db.batch([
          s.statement,
          q('UPDATE users SET last_login_at=? WHERE id=?', now(), u.id),
        ]);
        return json({ code: 'LOGIN_SUCCESS', banned: !!ban }, 200, {
          'Set-Cookie': setCookie(req, 'forum_session', s.token, 604800),
        });
      }
      if (path === 'auth/logout' && method === 'POST') {
        await q(
          'DELETE FROM sessions WHERE id=?',
          await digest(cookie(req, 'forum_session')),
        ).run();
        return json({ code: 'LOGGED_OUT' }, 200, {
          'Set-Cookie': setCookie(req, 'forum_session', '', 0),
        });
      }
      if (path === 'me' && method === 'GET') {
        const u = await user(req, false, true);
        return json({
          user: u
            ? {
                ...publicUser(u, u),
                ban: u.ban,
                permissions: permissions(u, c),
              }
            : null,
          settings: c,
          checked_in: u
            ? !!(await one(
                'SELECT id FROM check_ins WHERE user_id=? AND check_in_date=?',
                u.id,
                day(),
              ))
            : false,
          quiz_passed: !!(await one(
            'SELECT id FROM quiz_attempts WHERE id=? AND passed=1 AND consumed=0 AND expires_at>?',
            await digest(cookie(req, 'forum_quiz')),
            now(),
          )),
          setup_available: !(await one(
            "SELECT id FROM settings WHERE id='admin_initialized'",
          )),
        });
      }
      const u = await user(req);
      if (path.startsWith('admin')) admin(u);
      if (path === 'checkin' && method === 'POST') {
        await db
          .batch([
            q(
              'INSERT OR IGNORE INTO check_ins(id,user_id,check_in_date,points_awarded) VALUES(?,?,?,?)',
              `${u.id}:${day()}`,
              u.id,
              day(),
              c.checkin_points,
            ),
            q(
              "INSERT OR IGNORE INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) SELECT ?,user_id,points_awarded,'checkin',id,?,? FROM check_ins WHERE user_id=? AND check_in_date=?",
              uid(),
              now(),
              day(),
              u.id,
              day(),
            ),
          ])
          .then((r) => {
            if (!r[1].meta.changes) fail('ALREADY_CHECKED_IN', 409);
          });
        return json({
          code: 'CHECK_IN_SUCCESS',
          points: (await one('SELECT points FROM users WHERE id=?', u.id))
            .points,
        });
      }
      if (path === 'posts' && method === 'GET') {
        const category = url.searchParams.get('category') || '';
        const search = (url.searchParams.get('search') || '').slice(0, 120);
        const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
        const where =
          " WHERE p.status='published' AND (?='' OR p.category=?) AND (?='' OR p.title LIKE ? OR u.username LIKE ?)";
        const args = [category, category, search, `%${search}%`, `%${search}%`];
        const total = (
          await one(
            'SELECT count(*) n FROM posts p JOIN users u ON p.user_id=u.id' +
              where,
            ...args,
          )
        ).n;
        const ps = await rows(
          postQuery +
            where +
            ` ORDER BY p.pinned DESC, ${url.searchParams.get('sort') === 'hot' ? '(p.comment_count*3+p.view_count) DESC,' : ''} p.created_at DESC LIMIT 24 OFFSET ?`,
          ...args,
          offset,
        );
        return json({
          posts: await Promise.all(ps.map((p) => serializePost(p, u, c))),
          total,
        });
      }
      if (path === 'posts' && method === 'POST') {
        requirePoints(u, c, 'post');
        await rate(req, 'post:' + u.id, 10);
        const b = await body(req),
          v = await validatePost(b, u, c);
        const id = uid(),
          at = now();
        const reward = Number(c[b.category + '_points']);
        const duplicateSql =
          'NOT EXISTS(SELECT 1 FROM content_fingerprints WHERE user_id=? AND fingerprint=?)';
        const capSql =
          b.category === 'chat'
            ? "(SELECT count(*) FROM point_transactions WHERE user_id=? AND type='post_chat' AND reward_date=? AND amount>0)<?"
            : '1';
        const rewardArgs =
          b.category === 'chat' ? [u.id, day(), c.chat_daily_limit] : [];
        await db.batch([
          q(
            'INSERT INTO posts(id,user_id,category,title,tags,fingerprint,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
            id,
            u.id,
            b.category,
            b.title.trim(),
            JSON.stringify(v.tags),
            v.fingerprint,
            at,
            at,
          ),
          ...blockStatements(b, id, c, at),
          ...v.ms.flatMap((m) => [
            q('UPDATE media SET post_id=? WHERE id=?', id, m.id),
            ...(m.cover_id
              ? [q('UPDATE media SET post_id=? WHERE id=?', id, m.cover_id)]
              : []),
          ]),
          q(
            `INSERT INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) SELECT ?,?,CASE WHEN ${duplicateSql} AND ${capSql} THEN ? ELSE 0 END,?,?,?,?`,
            uid(),
            u.id,
            u.id,
            v.fingerprint,
            ...rewardArgs,
            reward,
            'post_' + b.category,
            id,
            at,
            day(),
          ),
          q(
            'INSERT OR IGNORE INTO content_fingerprints(id,user_id,fingerprint,created_at) VALUES(?,?,?,?)',
            uid(),
            u.id,
            v.fingerprint,
            at,
          ),
        ]);
        const p = await one('SELECT points_awarded FROM posts WHERE id=?', id);
        return json(
          {
            code: 'POST_CREATED',
            id,
            awarded: p.points_awarded,
            message:
              p.points_awarded < reward
                ? '今日该类型积分奖励已达到上限，或与已发布内容重复。'
                : '发布成功',
          },
          201,
        );
      }
      if (parts[0] === 'posts' && parts[1]) {
        const p = await getPost(parts[1], u);
        if (parts.length === 2 && method === 'GET') {
          await q(
            'UPDATE posts SET view_count=view_count+1 WHERE id=?',
            p.id,
          ).run();
          p.view_count++;
          return json(
            await serializePost(
              p,
              u,
              c,
              true,
              Math.max(0, Number(url.searchParams.get('comment_offset')) || 0),
            ),
          );
        }
        if (parts.length === 2 && method === 'PATCH') {
          if (p.user_id !== u.id) admin(u);
          if (p.status === 'deleted') fail('NOT_FOUND', 404);
          const b = await body(req);
          if (b.updated_at && b.updated_at !== p.updated_at)
            fail('CONFLICT', 409);
          b.category = p.category;
          const v = await validatePost(b, u, c, p.id);
          const at = now();
          await db.batch([
            q(
              'UPDATE posts SET title=?,tags=?,updated_at=? WHERE id=?',
              b.title.trim(),
              JSON.stringify(v.tags),
              at,
              p.id,
            ),
            q('DELETE FROM post_content_blocks WHERE post_id=?', p.id),
            ...blockStatements(b, p.id, c, at),
            ...v.ms.flatMap((m) => [
              q('UPDATE media SET post_id=? WHERE id=?', p.id, m.id),
              ...(m.cover_id
                ? [q('UPDATE media SET post_id=? WHERE id=?', p.id, m.cover_id)]
                : []),
            ]),
            q(
              'INSERT OR IGNORE INTO content_fingerprints(id,user_id,fingerprint,created_at) VALUES(?,?,?,?)',
              uid(),
              p.user_id,
              v.fingerprint,
              at,
            ),
            ...(u.role === 'admin'
              ? [audit(u, 'edit_post', 'post', p.id, {})]
              : []),
          ]);
          return json({ code: 'POST_UPDATED', id: p.id });
        }
        if (parts.length === 2 && method === 'DELETE') {
          if (p.user_id !== u.id) admin(u);
          const b = await body(req);
          await db.batch([
            q(
              "UPDATE posts SET status='deleted',updated_at=? WHERE id=?",
              now(),
              p.id,
            ),
            ...(p.user_id === u.id || b.deduct !== false
              ? [rollback(p.user_id, 'post_' + p.category, p.id)]
              : []),
            ...(u.role === 'admin'
              ? [
                  audit(u, 'delete_post', 'post', p.id, {
                    deduct: b.deduct !== false,
                  }),
                ]
              : []),
          ]);
          return json({ code: 'POST_DELETED' });
        }
        if (parts[2] === 'like' && method === 'POST') {
          if (p.status !== 'published') fail('NOT_FOUND', 404);
          const b = await body(req);
          await (
            b.liked
              ? q(
                  'INSERT OR IGNORE INTO likes(id,post_id,user_id) VALUES(?,?,?)',
                  uid(),
                  p.id,
                  u.id,
                )
              : q('DELETE FROM likes WHERE post_id=? AND user_id=?', p.id, u.id)
          ).run();
          return json({ code: 'LIKE_UPDATED' });
        }
        if (parts[2] === 'comments' && method === 'POST') {
          requirePoints(u, c, 'comment');
          if (p.status !== 'published') fail('NOT_FOUND', 404);
          await rate(req, 'comment:' + u.id, 15);
          const b = await body(req);
          if (typeof b.content !== 'string' || !effective(b.content))
            fail('EMPTY_COMMENT');
          if (b.content.length > 10000) fail('CONTENT_TOO_LONG');
          const count = effective(b.content),
            amount =
              count >= 20 ? c.long_comment_points : c.short_comment_points,
            id = uid(),
            at = now(),
            hash = await digest(normalize(b.content));
          await db.batch([
            q(
              'INSERT INTO comments(id,post_id,user_id,content,fingerprint,effective_character_count,created_at) VALUES(?,?,?,?,?,?,?)',
              id,
              p.id,
              u.id,
              b.content.trim(),
              hash,
              count,
              at,
            ),
            q(
              "INSERT INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) SELECT ?,?,CASE WHEN EXISTS(SELECT 1 FROM comments WHERE user_id=? AND fingerprint=? AND id<>? AND created_at>?) THEN 0 ELSE min(?,max(0,?-(SELECT COALESCE(SUM(amount),0) FROM point_transactions WHERE user_id=? AND type='comment' AND reward_date=? AND amount>0))) END,'comment',?,?,?",
              uid(),
              u.id,
              u.id,
              hash,
              id,
              new Date(Date.now() - 600000).toISOString(),
              amount,
              c.comment_daily_cap,
              u.id,
              day(),
              id,
              at,
              day(),
            ),
          ]);
          const earned = (
            await one('SELECT points_awarded FROM comments WHERE id=?', id)
          ).points_awarded;
          return json(
            {
              code: 'COMMENT_CREATED',
              id,
              awarded: earned,
              message:
                earned < amount
                  ? '今日该类型积分奖励已达到上限，或短时间内评论内容重复。'
                  : '评论成功',
            },
            201,
          );
        }
      }
      if (parts[0] === 'comments' && method === 'DELETE') {
        const v = await one('SELECT * FROM comments WHERE id=?', parts[1]);
        if (!v) fail('NOT_FOUND', 404);
        if (v.user_id !== u.id) admin(u);
        const b = await body(req);
        await db.batch([
          q("UPDATE comments SET status='deleted' WHERE id=?", v.id),
          ...(v.user_id === u.id || b.deduct !== false
            ? [rollback(v.user_id, 'comment', v.id)]
            : []),
          ...(u.role === 'admin'
            ? [
                audit(u, 'delete_comment', 'comment', v.id, {
                  deduct: b.deduct !== false,
                }),
              ]
            : []),
        ]);
        return json({ code: 'COMMENT_DELETED' });
      }
      if (parts[0] === 'users' && parts[1] && method === 'GET') {
        const v = await one('SELECT * FROM users WHERE id=?', parts[1]);
        if (!v) fail('NOT_FOUND', 404);
        const ps = await rows(
          postQuery +
            " WHERE p.user_id=? AND p.status='published' ORDER BY p.created_at DESC LIMIT 50 OFFSET ?",
          v.id,
          offset,
        );
        v.account_status = (
          await one(
            "SELECT count(*) n FROM bans WHERE user_id=? AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?)",
            v.id,
            now(),
            now(),
          )
        ).n
          ? 'banned'
          : 'active';
        return json({
          ...publicUser(v, u),
          post_count: (
            await one(
              "SELECT count(*) n FROM posts WHERE user_id=? AND status='published'",
              v.id,
            )
          ).n,
          comment_count: (
            await one(
              "SELECT count(*) n FROM comments WHERE user_id=? AND status='published'",
              v.id,
            )
          ).n,
          posts: await Promise.all(ps.map((p) => serializePost(p, u, c))),
        });
      }
      if (path === 'me/points' && method === 'GET') {
        return json({
          points: u.points,
          transactions: await rows(
            'SELECT id,amount,type,source_id,balance_after,created_at FROM point_transactions WHERE user_id=? ORDER BY rowid DESC LIMIT 100 OFFSET ?',
            u.id,
            offset,
          ),
        });
      }
      if (path === 'me/avatar' && method === 'POST') {
        const b = await body(req);
        const m = await one(
          "SELECT * FROM media WHERE id=? AND user_id=? AND status='ready' AND media_type='image' AND post_id IS NULL",
          b.media_id,
          u.id,
        );
        if (!m) fail('UPLOAD_FAILED');
        await q('UPDATE users SET avatar=? WHERE id=?', m.id, u.id).run();
        return json({ code: 'AVATAR_UPDATED' });
      }
      if (path === 'uploads/start' && method === 'POST') {
        await rate(req, 'upload:' + u.id, 30);
        const b = await body(req);
        const name = String(b.name || '').slice(0, 180),
          ext = name.split('.').pop()?.toLowerCase();
        const mimeMap: any = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          gif: 'image/gif',
          mp4: 'video/mp4',
          webm: 'video/webm',
          mov: 'video/quicktime',
        };
        const mime = mimeMap[ext || ''];
        const type = b.media_type;
        if (
          !['image', 'video'].includes(type) ||
          !mime ||
          !mime.startsWith(type + '/')
        )
          fail(type === 'image' ? 'INVALID_IMAGE_TYPE' : 'INVALID_VIDEO_TYPE');
        const size = Number(b.size);
        if (!Number.isSafeInteger(size) || size < 1) fail('UPLOAD_FAILED');
        if (size > c[type + '_max_mb'] * 1024 * 1024)
          fail(type === 'image' ? 'IMAGE_TOO_LARGE' : 'VIDEO_TOO_LARGE');
        const id = uid(),
          key = `media/${u.id}/${id}`;
        const upload = await env.FILES.createMultipartUpload(key, {
          httpMetadata: { contentType: mime },
        });
        await q(
          'INSERT INTO media(id,user_id,media_type,file_url,file_size,mime,name,upload_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          id,
          u.id,
          type,
          key,
          size,
          mime,
          name,
          upload.uploadId,
          now(),
        ).run();
        return json({ id, chunk_size: 8 * 1024 * 1024 });
      }
      if (parts[0] === 'uploads' && parts[1]) {
        const m = await one(
          'SELECT * FROM media WHERE id=? AND user_id=?',
          parts[1],
          u.id,
        );
        if (!m) fail('NOT_FOUND', 404);
        if (method === 'DELETE') {
          if (m.post_id) fail('FORBIDDEN', 403);
          if (m.status === 'uploading')
            await env.FILES.resumeMultipartUpload(
              m.file_url,
              m.upload_id,
            ).abort();
          else await env.FILES.delete(m.file_url);
          await q("UPDATE media SET status='removed' WHERE id=?", m.id).run();
          return json({ code: 'UPLOAD_REMOVED' });
        }
        if (m.status !== 'uploading') fail('UPLOAD_FAILED');
        const upload = env.FILES.resumeMultipartUpload(m.file_url, m.upload_id);
        if (parts[2] === 'part' && method === 'PUT') {
          const part = Number(url.searchParams.get('number'));
          const chunk = 8 * 1024 * 1024;
          const count = Math.ceil(m.file_size / chunk);
          if (!Number.isInteger(part) || part < 1 || part > count)
            fail('UPLOAD_FAILED');
          const expected =
            part === count ? m.file_size - (part - 1) * chunk : chunk;
          if (Number(req.headers.get('content-length')) !== expected)
            fail('UPLOAD_FAILED');
          const buffer = await req.arrayBuffer();
          if (buffer.byteLength !== expected) fail('UPLOAD_FAILED');
          if (part === 1) {
            const a = new Uint8Array(buffer),
              ascii = (s: number, e: number) =>
                String.fromCharCode(...a.slice(s, e));
            const good =
              m.mime === 'image/jpeg'
                ? a[0] === 255 && a[1] === 216 && a[2] === 255
                : m.mime === 'image/png'
                  ? a[0] === 137 && ascii(1, 4) === 'PNG'
                  : m.mime === 'image/gif'
                    ? ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
                    : m.mime === 'image/webp'
                      ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
                      : m.mime === 'video/webm'
                        ? a[0] === 26 &&
                          a[1] === 69 &&
                          a[2] === 223 &&
                          a[3] === 163
                        : [
                            'ftyp',
                            'moov',
                            'mdat',
                            'wide',
                            'free',
                            'skip',
                          ].includes(ascii(4, 8));
            if (!good)
              fail(
                m.media_type === 'image'
                  ? 'INVALID_IMAGE_TYPE'
                  : 'INVALID_VIDEO_TYPE',
              );
          }
          const result = await upload.uploadPart(part, buffer);
          await q(
            'INSERT INTO media_parts(id,media_id,part_number,etag,digest,size) VALUES(?,?,?,?,?,?) ON CONFLICT(media_id,part_number) DO UPDATE SET etag=excluded.etag,digest=excluded.digest,size=excluded.size',
            `${m.id}:${part}`,
            m.id,
            part,
            result.etag,
            await digest(buffer),
            buffer.byteLength,
          ).run();
          return json({ code: 'PART_UPLOADED', part });
        }
        if (parts[2] === 'complete' && method === 'POST') {
          const b = await body(req),
            ps = await rows(
              'SELECT * FROM media_parts WHERE media_id=? ORDER BY part_number',
              m.id,
            );
          if (
            ps.length !== Math.ceil(m.file_size / (8 * 1024 * 1024)) ||
            ps.reduce((n, v) => n + v.size, 0) !== m.file_size
          )
            fail('UPLOAD_INTERRUPTED');
          if (
            b.cover_id &&
            !(await one(
              "SELECT id FROM media WHERE id=? AND user_id=? AND media_type='image' AND status='ready' AND post_id IS NULL",
              b.cover_id,
              u.id,
            ))
          )
            fail('UPLOAD_FAILED');
          await upload.complete(
            ps.map((v) => ({ partNumber: v.part_number, etag: v.etag })),
          );
          try {
            await validateStoredMedia(env.FILES, m);
          } catch (e) {
            await env.FILES.delete(m.file_url);
            await q("UPDATE media SET status='invalid' WHERE id=?", m.id).run();
            throw e;
          }
          await q(
            "UPDATE media SET status='ready',fingerprint=?,cover_id=? WHERE id=?",
            await digest(ps.map((v) => v.digest).join('|')),
            b.cover_id || null,
            m.id,
          ).run();
          return json({
            id: m.id,
            url: `/api/media/${m.id}`,
            media_type: m.media_type,
            cover_url: b.cover_id ? `/api/media/${b.cover_id}` : null,
          });
        }
      }
      if (
        parts[0] === 'media' &&
        parts[1] &&
        ['GET', 'HEAD'].includes(method)
      ) {
        const m = await mediaAccess(parts[1], u, c);
        const range = req.headers.get('range');
        let offset = 0,
          length = m.file_size;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2]))
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${m.file_size}` },
            });
          if (match[1]) {
            offset = Number(match[1]);
            length =
              Math.min(
                m.file_size - 1,
                match[2] ? Number(match[2]) : m.file_size - 1,
              ) -
              offset +
              1;
          } else {
            length = Math.min(Number(match[2]), m.file_size);
            offset = m.file_size - length;
          }
          if (offset >= m.file_size || length <= 0)
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${m.file_size}` },
            });
        }
        const obj =
          method === 'HEAD'
            ? await env.FILES.head(m.file_url)
            : await env.FILES.get(
                m.file_url,
                range ? { range: { offset, length } } : {},
              );
        if (!obj) fail('NOT_FOUND', 404);
        return new Response(
          method === 'HEAD' ? null : (obj as R2ObjectBody).body,
          {
            status: range ? 206 : 200,
            headers: {
              'Content-Type': m.mime,
              'Content-Length': String(length),
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "default-src 'none'; sandbox",
              'Content-Disposition': `inline; filename="media.${m.name.split('.').pop()}"`,
              'Accept-Ranges': 'bytes',
              ...(range
                ? {
                    'Content-Range': `bytes ${offset}-${offset + length - 1}/${m.file_size}`,
                  }
                : {}),
            },
          },
        );
      }
      if (path === 'admin/users' && method === 'GET') {
        const search = (url.searchParams.get('search') || '').slice(0, 120);
        return json({
          users: (
            await rows(
              "SELECT u.*, (SELECT count(*) FROM posts WHERE user_id=u.id AND status='published') post_count,(SELECT count(*) FROM comments WHERE user_id=u.id AND status='published') comment_count,(SELECT reason FROM bans WHERE user_id=u.id AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?) ORDER BY start_at DESC LIMIT 1) current_ban FROM users u WHERE username LIKE ? OR email LIKE ? OR id=? ORDER BY created_at DESC LIMIT 50 OFFSET ?",
              now(),
              now(),
              `%${search}%`,
              `%${search}%`,
              search,
              offset,
            )
          ).map((v) => ({
            ...publicUser(v, u),
            post_count: v.post_count,
            comment_count: v.comment_count,
            account_status: v.current_ban ? 'banned' : 'active',
            ban_reason: v.current_ban,
          })),
        });
      }
      if (
        parts[0] === 'admin' &&
        parts[1] === 'users' &&
        parts[2] &&
        method === 'PATCH'
      ) {
        const target = await one('SELECT * FROM users WHERE id=?', parts[2]);
        if (!target) fail('NOT_FOUND', 404);
        const b = await body(req);
        if (b.action === 'points') {
          const n = Number(b.points);
          if (!Number.isSafeInteger(n) || n < 0 || n > 10000000)
            fail('INVALID_SETTINGS');
          if (
            await one(
              "SELECT id FROM bans WHERE user_id=? AND status='active' AND start_at<=? AND (end_at IS NULL OR end_at>?)",
              target.id,
              now(),
              now(),
            )
          )
            fail('ACCOUNT_BANNED', 403);
          await db.batch([
            q(
              "INSERT INTO point_transactions(id,user_id,amount,type,source_id,created_at,reward_date) SELECT ?,id,?-points,'admin_adjust',?,?,? FROM users WHERE id=?",
              uid(),
              n,
              uid(),
              now(),
              day(),
              target.id,
            ),
            audit(u, 'adjust_points', 'user', target.id, {
              to: n,
              reason: String(b.reason || '管理员调整'),
            }),
          ]);
          return json({ code: 'POINTS_UPDATED' });
        }
        if (b.action === 'ban') {
          if (target.role === 'admin') fail('FORBIDDEN', 403);
          const start = b.start_at ? new Date(b.start_at).toISOString() : now(),
            end = b.end_at ? new Date(b.end_at).toISOString() : null;
          if (end && (end <= start || end <= now())) fail('INVALID_SETTINGS');
          if (!String(b.reason || '').trim()) fail('BAN_REASON_REQUIRED');
          await db.batch([
            q(
              "UPDATE bans SET status='revoked' WHERE user_id=? AND status='active'",
              target.id,
            ),
            q(
              'INSERT INTO bans(id,user_id,admin_id,reason,start_at,end_at) VALUES(?,?,?,?,?,?)',
              uid(),
              target.id,
              u.id,
              String(b.reason).slice(0, 1000),
              start,
              end,
            ),
            q(
              "UPDATE users SET account_status='banned',banned_until=?,ban_reason=? WHERE id=?",
              end,
              b.reason,
              target.id,
            ),
            audit(u, 'ban_user', 'user', target.id, {
              reason: b.reason,
              start_at: start,
              end_at: end,
            }),
          ]);
          return json({ code: 'USER_BANNED' });
        }
        if (b.action === 'unban') {
          await db.batch([
            q(
              "UPDATE bans SET status='revoked' WHERE user_id=? AND status='active'",
              target.id,
            ),
            q(
              "UPDATE users SET account_status='active',ban_reason=NULL,banned_until=NULL WHERE id=?",
              target.id,
            ),
            audit(u, 'unban_user', 'user', target.id, {}),
          ]);
          return json({ code: 'USER_UNBANNED' });
        }
      }
      if (path === 'admin/posts' && method === 'GET') {
        const search = (url.searchParams.get('search') || '').slice(0, 120),
          cat = url.searchParams.get('category') || '',
          from = url.searchParams.get('from') || '',
          to = url.searchParams.get('to') || '';
        const ps = await rows(
          postQuery +
            " WHERE (?='' OR p.title LIKE ? OR u.username LIKE ? OR p.user_id=?) AND (?='' OR category=?) AND (?='' OR p.created_at>=?) AND (?='' OR p.created_at<=?) ORDER BY p.created_at DESC LIMIT 50 OFFSET ?",
          search,
          `%${search}%`,
          `%${search}%`,
          search,
          cat,
          cat,
          from,
          from,
          to,
          to ? to + 'T23:59:59.999Z' : '',
          offset,
        );
        return json({
          posts: await Promise.all(ps.map((p) => serializePost(p, u, c))),
        });
      }
      if (
        parts[0] === 'admin' &&
        parts[1] === 'posts' &&
        parts[2] &&
        method === 'PATCH'
      ) {
        const p = await getPost(parts[2], u),
          b = await body(req);
        if (!['hide', 'restore', 'pin', 'unpin'].includes(b.action))
          fail('INVALID_REQUEST');
        const s =
          b.action === 'hide'
            ? q("UPDATE posts SET status='hidden' WHERE id=?", p.id)
            : b.action === 'restore'
              ? q("UPDATE posts SET status='published' WHERE id=?", p.id)
              : q(
                  'UPDATE posts SET pinned=? WHERE id=?',
                  b.action === 'pin' ? 1 : 0,
                  p.id,
                );
        await db.batch([s, audit(u, b.action + '_post', 'post', p.id, {})]);
        return json({ code: 'POST_UPDATED' });
      }
      if (path === 'admin/comments' && method === 'GET') {
        return json({
          comments: await rows(
            'SELECT c.id,c.post_id,c.user_id,c.content,c.points_awarded,c.status,c.created_at,u.username,p.title FROM comments c JOIN users u ON u.id=c.user_id JOIN posts p ON p.id=c.post_id ORDER BY c.created_at DESC LIMIT 50 OFFSET ?',
            offset,
          ),
        });
      }
      if (path === 'admin/logs' && method === 'GET') {
        return json({
          logs: await rows(
            'SELECT l.*,u.username FROM admin_logs l JOIN users u ON u.id=l.admin_id ORDER BY l.rowid DESC LIMIT 50 OFFSET ?',
            offset,
          ),
        });
      }
      if (path === 'admin/settings' && method === 'PUT') {
        const b = await body(req),
          v = { ...c };
        for (const k of Object.keys(defaults)) {
          if (b[k] === undefined) continue;
          if (typeof (defaults as any)[k] === 'number') {
            if (!Number.isSafeInteger(b[k]) || b[k] < 0 || b[k] > 10000)
              fail('INVALID_SETTINGS');
            v[k] = b[k];
          } else if (k === 'locked_enabled') {
            if (typeof b[k] !== 'boolean') fail('INVALID_SETTINGS');
            v[k] = b[k];
          } else if (k === 'locked_categories') {
            if (
              !Array.isArray(b[k]) ||
              b[k].some((x: any) => !['article', 'image'].includes(x))
            )
              fail('INVALID_SETTINGS');
            v[k] = [...new Set(b[k])];
          } else if (k === 'ban_login_mode') {
            if (!['reason', 'deny'].includes(b[k])) fail('INVALID_SETTINGS');
            v[k] = b[k];
          }
        }
        if (
          v.quiz_draw_count < 1 ||
          v.quiz_pass_score < 1 ||
          v.image_max_mb < 1 ||
          v.video_max_mb < 1 ||
          v.image_max_count < 1 ||
          v.image_max_count > 100 ||
          v.video_max_count < 1 ||
          v.video_max_count > 20 ||
          v.min_public_images < 1 ||
          v.min_public_chars < 1 ||
          v.min_public_images > v.image_max_count ||
          v.video_max_mb > 2048 ||
          v.image_max_mb > 200
        )
          fail('INVALID_SETTINGS');
        const qs = await rows(
          "SELECT score FROM quiz_questions WHERE status='active' ORDER BY score ASC",
        );
        if (
          v.quiz_draw_count > qs.length ||
          qs.slice(0, v.quiz_draw_count).reduce((n, x) => n + x.score, 0) <
            v.quiz_pass_score
        )
          fail('INVALID_SETTINGS');
        await db.batch([
          q("UPDATE settings SET value=? WHERE id='config'", JSON.stringify(v)),
          audit(u, 'update_settings', 'settings', 'config', v),
        ]);
        return json({ code: 'SETTINGS_UPDATED', settings: v });
      }
      if (path === 'admin/quiz' && method === 'GET')
        return json({
          questions: await rows(
            'SELECT * FROM quiz_questions ORDER BY sort_order,id',
          ),
        });
      if (path === 'admin/quiz' && method === 'PUT') {
        const b = await body(req);
        if (
          !Array.isArray(b.questions) ||
          !b.questions.length ||
          b.questions.length > 100
        )
          fail('INVALID_SETTINGS');
        for (const v of b.questions) {
          if (
            !v.question?.trim() ||
            !v.correct_answer?.trim() ||
            v.type !== 'text' ||
            !Number.isInteger(v.score) ||
            v.score < 1 ||
            v.score > 1000 ||
            !['active', 'inactive'].includes(v.status)
          )
            fail('INVALID_SETTINGS');
        }
        const active = b.questions
          .filter((x: any) => x.status === 'active')
          .sort((a: any, b: any) => a.score - b.score);
        if (
          active.length < c.quiz_draw_count ||
          active
            .slice(0, c.quiz_draw_count)
            .reduce((n: number, x: any) => n + x.score, 0) < c.quiz_pass_score
        )
          fail('INVALID_SETTINGS');
        await db.batch([
          q('DELETE FROM quiz_questions'),
          ...b.questions.map((v: any, i: number) =>
            q(
              'INSERT INTO quiz_questions(id,question,type,correct_answer,score,sort_order,status) VALUES(?,?,?,?,?,?,?)',
              v.id || uid(),
              v.question.slice(0, 500),
              'text',
              v.correct_answer.slice(0, 500),
              v.score,
              i,
              v.status,
            ),
          ),
          q('DELETE FROM quiz_attempts WHERE consumed=0'),
          audit(u, 'update_quiz', 'quiz', 'questions', {
            count: b.questions.length,
          }),
        ]);
        return json({ code: 'QUIZ_UPDATED' });
      }
      fail('NOT_FOUND', 404);
    } catch (e: any) {
      if (e instanceof AppError)
        return json(
          {
            code: e.code,
            message: messages[e.code] || e.code,
            ...(e.detail || {}),
          },
          e.status,
        );
      const msg = String(e?.message || '');
      const known = Object.keys(messages).find((k) => msg.includes(k));
      if (known) return json({ code: known, message: messages[known] }, 400);
      if (
        msg.includes('FOREIGN KEY') &&
        new URL(req.url).pathname === '/api/auth/register'
      )
        return json(
          { code: 'QUIZ_NOT_PASSED', message: messages.QUIZ_NOT_PASSED },
          403,
        );
      if (
        msg.includes('settings.id') &&
        new URL(req.url).pathname === '/api/auth/setup'
      )
        return json(
          { code: 'SETUP_DISABLED', message: messages.SETUP_DISABLED },
          403,
        );
      if (msg.includes('users.username_key'))
        return json(
          { code: 'USERNAME_EXISTS', message: messages.USERNAME_EXISTS },
          409,
        );
      if (msg.includes('users.email'))
        return json(
          { code: 'EMAIL_EXISTS', message: messages.EMAIL_EXISTS },
          409,
        );
      console.error(
        'Forum request failed',
        req.method,
        new URL(req.url).pathname,
        msg,
      );
      return json(
        { code: 'SERVER_ERROR', message: '服务暂时遇到问题，请稍后重试。' },
        500,
      );
    }
  }
  return { handle, init, config, user, publicUser, q, one, rows };
}
