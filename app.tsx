'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Heart,
  LockKeyhole,
  ArrowRight,
  BookOpen,
  Image as ImageIcon,
  Video,
  MessagesSquare,
  Home,
  CalendarCheck,
  UserRound,
  ShieldCheck,
  LogOut,
  Search,
  Plus,
  ArrowLeft,
  MessageCircle,
  Eye,
  ThumbsUp,
  Pin,
  ChevronRight,
  FileText,
  Settings,
  Users,
  ScrollText,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Check,
  Unlock,
  LoaderCircle,
  Menu,
  ImagePlus,
  Type,
  X,
  Pencil,
  Info,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { defaults, categories, effective } from '@/lib/config';
const icons: any = {
  article: BookOpen,
  image: ImageIcon,
  video: Video,
  chat: MessagesSquare,
};
export async function api(path: string, method = 'GET', body?: any) {
  const r = await fetch('/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forum-Request': '1' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const d: any = await r.json();
  if (!r.ok) {
    const e: any = new Error(d.message || d.code);
    e.code = d.code;
    e.data = d;
    throw e;
  }
  return d;
}
const date = (v: string) =>
  v
    ? new Date(v).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const level = (u: any, c: any) =>
  u.role === 'admin'
    ? '管理员'
    : u.points >= Math.max(c.comment_threshold, c.locked_threshold)
      ? '正式同好'
      : u.points >= c.post_threshold
        ? '活跃成员'
        : '新人';
function Avatar({ user, size = '' }: any) {
  return (
    <span className={'avatar ' + size}>
      {user.avatar ? (
        <img src={user.avatar} alt={user.username + '的头像'} />
      ) : (
        user.username?.slice(0, 1).toUpperCase() || '同'
      )}
    </span>
  );
}
function Empty({
  title = '这里还安安静静',
  text = '还没有内容，来分享第一份喜欢吧。',
  children,
}: any) {
  return (
    <div className="empty-state">
      <MessagesSquare size={38} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Hint({ children }: any) {
  return (
    <div className="hint">
      <Info size={16} />
      <span>{children}</span>
    </div>
  );
}
export default function Forum() {
  const [ctx, setCtx] = useState<any>(null),
    [path, setPath] = useState('/'),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [confirm, setConfirm] = useState<any>(null);
  const go = useCallback((p: string) => {
    history.pushState({}, '', p);
    setPath(p);
    window.dispatchEvent(new Event('forum:navigate'));
    setNotice('');
    window.scrollTo(0, 0);
  }, []);
  const refresh = useCallback(async () => {
    const d = await api('me');
    setCtx(d);
    return d;
  }, []);
  useEffect(() => {
    setPath(location.pathname + location.search);
    const f = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', f);
    refresh()
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false));
    const focus = () => refresh().catch(() => {});
    window.addEventListener('focus', focus);
    const timer = setInterval(focus, 30000);
    return () => {
      window.removeEventListener('popstate', f);
      window.removeEventListener('focus', focus);
      clearInterval(timer);
    };
  }, [refresh]);
  async function act(fn: () => Promise<any>, success?: string) {
    try {
      const d = await fn();
      if (success) setNotice(success);
      await refresh();
      setRevision((v) => v + 1);
      return d;
    } catch (e: any) {
      setNotice(e.message);
      await refresh().catch(() => {});
      throw e;
    }
  }
  const perform = (fn: () => Promise<any>, success?: string) =>
    void act(fn, success).catch(() => {});
  const ask = (
    title: string,
    description: string,
    fn: () => Promise<any>,
    admin = false,
  ) => setConfirm({ title, description, fn, admin, deduct: true });
  useEffect(() => {
    const mc = (document as any).modelContext;
    if (!mc?.registerTool || !ctx?.user) return;
    const controller = new AbortController();
    const register = (t: any) =>
      Promise.resolve(mc.registerTool(t, { signal: controller.signal })).catch(
        () => {},
      );
    register({
      name: 'forum_daily_check_in',
      title: '论坛每日签到',
      description: '为当前登录成员完成今天的签到并刷新积分。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (x: any) => {
        if (x && Object.keys(x).length) throw new Error('不接受额外参数');
        const d = await act(() => api('checkin', 'POST', {}), '签到成功');
        return { code: d.code, points: d.points };
      },
    });
    register({
      name: 'forum_search_posts',
      title: '搜索论坛帖子',
      description: '搜索当前成员有权浏览的帖子，并在页面显示搜索结果。',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', maxLength: 120 } },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (x: any) => {
        if (typeof x.query !== 'string' || x.query.length > 120)
          throw new Error('搜索文字无效');
        go('/?search=' + encodeURIComponent(x.query));
        return {
          query: x.query,
          ...(await api('posts?search=' + encodeURIComponent(x.query))),
        };
      },
    });
    return () => controller.abort();
  }, [ctx?.user?.id]);
  const c = ctx?.settings || defaults,
    u = ctx?.user;
  if (loading)
    return (
      <div className="initial-load">
        <Heart size={34} />
        <h2>同好交流论坛</h2>
        <p>正在打开我们的社区…</p>
      </div>
    );
  if (!u)
    return (
      <Gate
        mode={
          path.startsWith('/login')
            ? 'login'
            : path.startsWith('/setup')
              ? 'setup'
              : path.startsWith('/register') && ctx?.quiz_passed
                ? 'register'
                : 'quiz'
        }
        ctx={ctx}
        go={go}
        refresh={refresh}
        notice={notice}
        setNotice={setNotice}
      />
    );
  if (u.ban)
    return (
      <main className="banned-page">
        <LockKeyhole size={42} />
        <h1>账号暂时受限</h1>
        <p>{u.ban.reason}</p>
        <p className="muted">
          {u.ban.end_at
            ? '封禁至 ' + new Date(u.ban.end_at).toLocaleString('zh-CN')
            : '永久封禁'}
        </p>
        <p>当前积分 {u.points} · 解封后恢复原有权限</p>
        <button
          className="secondary"
          onClick={() => perform(() => api('auth/logout', 'POST', {}))}
        >
          退出登录
        </button>
      </main>
    );
  const active = path.split('?')[0],
    cat = active.startsWith('/category/') ? active.split('/')[2] : '';
  const nav = [
    ['/', '首页', Home],
    ...Object.entries(categories).map(([k, v]: any) => [
      '/category/' + k,
      v.name,
      icons[k],
    ]),
  ];
  const props = { u, c, go, act, perform, ask, revision, setNotice };
  return (
    <SidebarProvider style={{ '--sidebar-width': '220px' } as any}>
      <SidebarCloser />
      <Sidebar className="forum-sidebar">
        <SidebarHeader>
          <a className="brand" onClick={() => go('/')}>
            <span className="brand-icon">
              <Heart size={22} />
            </span>
            <strong>同好交流论坛</strong>
          </a>
          <span className="sidebar-subtitle">
            <LockKeyhole size={12} /> 我们的私密交流空间
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>社区</SidebarGroupLabel>
            <SidebarMenu>
              {nav.map(([href, label, Icon]: any) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={active === href}
                    onClick={() => go(href)}
                    className="nav-button"
                  >
                    <Icon />
                    <span>{label}</span>
                    {href === '/category/chat' && <span className="nav-dot" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>我的空间</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="nav-button"
                  onClick={() =>
                    perform(
                      () => api('checkin', 'POST', {}),
                      '签到成功，积分已到账',
                    )
                  }
                >
                  <CalendarCheck />
                  <span>{ctx.checked_in ? '今日已签到' : '每日签到'}</span>
                  <small>+{c.checkin_points}</small>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === '/me'}
                  className="nav-button"
                  onClick={() => go('/me')}
                >
                  <UserRound />
                  我的主页
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === '/points'}
                  className="nav-button"
                  onClick={() => go('/points')}
                >
                  <ScrollText />
                  积分记录
                </SidebarMenuButton>
              </SidebarMenuItem>
              {u.role === 'admin' && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={active.startsWith('/admin')}
                    className="nav-button"
                    onClick={() => go('/admin')}
                  >
                    <ShieldCheck />
                    管理后台
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-note">
            <Heart size={17} />
            <p>
              热爱有回应，
              <br />
              分享有回响。
            </p>
          </div>
          <div className="sidebar-user">
            <button onClick={() => go('/me')}>
              <Avatar user={u} />
              <span>
                <strong>{u.username}</strong>
                <small>{level(u, c)}</small>
              </span>
            </button>
            <button
              aria-label="退出登录"
              title="退出登录"
              onClick={() => perform(() => api('auth/logout', 'POST', {}))}
            >
              <LogOut size={16} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-heading">
            <SidebarTrigger aria-label="展开或收起导航" />
            <span>
              {categories[cat]?.name ||
                (active.startsWith('/admin')
                  ? '管理后台'
                  : active === '/me'
                    ? '我的主页'
                    : active === '/points'
                      ? '积分记录'
                      : '社区日常')}
            </span>
            <span className="private-label">
              <LockKeyhole size={12} /> 仅成员可见
            </span>
          </div>
          <SearchForm go={go} />
          <button
            aria-label="发布内容"
            className="primary small"
            onClick={() =>
              u.permissions.post
                ? go('/new')
                : setNotice(
                    `你的积分不足${c.post_threshold}分，暂未解锁发帖功能。`,
                  )
            }
          >
            <Plus size={17} />
            <span>发布内容</span>
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}
        <main className="main-content">
          {active.startsWith('/admin') ? (
            u.role === 'admin' ? (
              <Admin {...props} />
            ) : (
              <Empty title="无权访问" text="管理后台仅限管理员使用。" />
            )
          ) : active === '/new' || active.startsWith('/edit/') ? (
            <Editor {...props} postId={active.split('/')[2]} />
          ) : active.startsWith('/post/') ? (
            <PostDetail key={active} {...props} id={active.split('/')[2]} />
          ) : active === '/points' ? (
            <Points {...props} />
          ) : active === '/me' || active.startsWith('/user/') ? (
            <Profile
              key={active}
              {...props}
              id={active === '/me' ? u.id : active.split('/')[2]}
            />
          ) : (
            <Feed
              {...props}
              path={path}
              category={cat}
              checked={ctx.checked_in}
            />
          )}
        </main>
        <footer className="community-footer">
          <Heart size={12} /> 同好交流论坛{' '}
          <span>认真分享 · 友善交流 · 尊重原创</span>
        </footer>
      </div>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm?.description}
          </AlertDialogDescription>
          {confirm?.admin && (
            <label className="check-label">
              <Checkbox
                checked={confirm.deduct}
                onCheckedChange={(v) => setConfirm({ ...confirm, deduct: !!v })}
              />
              同时扣除该内容获得的积分
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const x = confirm;
                setConfirm(null);
                perform(() => x.fn(x.deduct), '操作完成');
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
function SidebarCloser() {
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    const close = () => setOpenMobile(false);
    window.addEventListener('forum:navigate', close);
    return () => window.removeEventListener('forum:navigate', close);
  }, [setOpenMobile]);
  return null;
}
function SearchForm({ go }: any) {
  const [search, setSearch] = useState('');
  return (
    <form
      className="global-search"
      onSubmit={(e) => {
        e.preventDefault();
        go('/?search=' + encodeURIComponent(search));
      }}
    >
      <Search size={17} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索感兴趣的内容"
        aria-label="搜索帖子"
      />
      <button type="submit">搜索</button>
    </form>
  );
}
function Gate({ mode, ctx, go, refresh, notice, setNotice }: any) {
  const [quiz, setQuiz] = useState<any>(null),
    [answers, setAnswers] = useState<any>({}),
    [busy, setBusy] = useState(false);
  const [b, setB] = useState<any>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    login: '',
    setup_token: '',
  });
  useEffect(() => {
    if (mode === 'quiz') {
      api('quiz/start', 'POST', {})
        .then(setQuiz)
        .catch((e) => setNotice(e.message));
    }
    if (mode === 'setup') {
      const params = new URLSearchParams(location.hash.slice(1));
      setB((v: any) => ({
        ...v,
        setup_token: params.get('key') || '',
        email: '',
      }));
      if (params.has('key')) history.replaceState({}, '', '/setup');
    }
  }, [mode]);
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      if (mode === 'quiz') {
        await api('quiz', 'POST', { answers });
        await refresh();
        go('/register');
      } else {
        await api(
          'auth/' +
            (mode === 'register'
              ? 'register'
              : mode === 'setup'
                ? 'setup'
                : 'login'),
          'POST',
          b,
        );
        await refresh();
        go('/');
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name: string,
    label: string,
    type = 'text',
    placeholder = '',
  ) => (
    <label>
      {label}
      <input
        required
        name={name}
        type={type}
        value={b[name]}
        onChange={(e) => setB({ ...b, [name]: e.target.value })}
        placeholder={placeholder}
        autoComplete={
          name === 'password'
            ? mode === 'login'
              ? 'current-password'
              : 'new-password'
            : name === 'confirmPassword'
              ? 'new-password'
              : name === 'username'
                ? 'username'
                : name === 'email'
                  ? 'email'
                  : 'off'
        }
      />
    </label>
  );
  return (
    <main className="gate">
      <header className="brand">
        <span className="brand-icon">
          <Heart size={23} />
        </span>
        <strong>同好交流论坛</strong>
        <span className="private-label">
          <LockKeyhole size={13} /> 私密社区
        </span>
      </header>
      <div className="gate-wrap">
        <section className="gate-intro">
          <span className="eyebrow">给每一份热爱，留一个位置</span>
          <h1>
            同频的人，
            <br />
            在这里相遇<span>。</span>
          </h1>
          <p>
            聊喜欢的故事，分享珍藏的瞬间。
            <br />
            这里是属于我们的交流小天地。
          </p>
          <div className="gate-categories">
            {Object.entries(categories).map(([k, v]: any, i) => {
              const Icon = icons[k];
              return (
                <div key={k} className={'gate-category c' + i}>
                  <Icon size={22} />
                  <strong>{v.name}</strong>
                  <small>{v.description}</small>
                </div>
              );
            })}
          </div>
          <div className="gate-foot">
            <LockKeyhole size={15} /> 内容仅对通过验证的社区成员开放
          </div>
        </section>
        <section className="gate-card">
          <span className="step">
            {mode === 'quiz'
              ? '01 准入验证 → 02 创建账号'
              : mode === 'register'
                ? '✓ 准入通过 → 02 创建账号'
                : mode === 'setup'
                  ? '社区管理员 · 首次设置'
                  : '欢迎回到我们的小天地'}
          </span>
          <div className="round-icon">
            {mode === 'login' ? <Heart size={26} /> : <LockKeyhole size={26} />}
          </div>
          <h2>
            {mode === 'quiz'
              ? '先对上我们的暗号'
              : mode === 'register'
                ? '很高兴，在这里遇见你'
                : mode === 'setup'
                  ? '设置管理员账号'
                  : '又见面啦'}
          </h2>
          <p className="muted">
            {mode === 'quiz'
              ? '完成小问题，就可以申请加入。'
              : mode === 'register'
                ? '创建账号，从每日签到开始积攒热爱。'
                : mode === 'setup'
                  ? '使用专用初始化凭证，为社区设置管理员。'
                  : '登录账号，看看大家的新分享。'}
          </p>
          <form onSubmit={submit}>
            {mode === 'quiz' ? (
              quiz?.questions.map((v: any) => (
                <label key={v.id}>
                  {v.question}
                  <input
                    required
                    value={answers[v.id] || ''}
                    onChange={(e) =>
                      setAnswers({ ...answers, [v.id]: e.target.value })
                    }
                    placeholder="输入你的答案"
                    autoComplete="off"
                    maxLength={500}
                  />
                </label>
              ))
            ) : (
              <>
                {mode === 'login' ? (
                  field('login', '用户名或邮箱', 'text', '输入用户名或邮箱')
                ) : (
                  <>
                    {field(
                      'username',
                      '用户名',
                      'text',
                      '3–20位英文字母或数字',
                    )}
                    {field('email', '邮箱', 'email', '你的常用邮箱')}
                  </>
                )}
                {field(
                  'password',
                  '密码',
                  'password',
                  '至少8位，包含字母和数字',
                )}
                {mode !== 'login' &&
                  field(
                    'confirmPassword',
                    '确认密码',
                    'password',
                    '再次输入密码',
                  )}
                {mode === 'setup' &&
                  field(
                    'setup_token',
                    '管理员初始化凭证',
                    'password',
                    '从交付信息中复制凭证',
                  )}
              </>
            )}
            {notice && (
              <div className="inline-error" role="alert">
                {notice}
              </div>
            )}
            <button
              className="primary"
              disabled={busy || (mode === 'quiz' && !quiz)}
            >
              {busy ? <LoaderCircle className="spin" size={17} /> : null}
              {mode === 'quiz'
                ? '验证并加入'
                : mode === 'login'
                  ? '登录社区'
                  : mode === 'setup'
                    ? '创建管理员账号'
                    : '创建账号'}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="gate-login">
            {mode === 'login' ? (
              <>
                还没有账号？{' '}
                <button className="text-link" onClick={() => go('/')}>
                  答题加入 →
                </button>
              </>
            ) : (
              <>
                已经是成员？{' '}
                <button className="text-link" onClick={() => go('/login')}>
                  登录账号 →
                </button>
              </>
            )}
          </div>
          <p className="fine">请认真交流，尊重创作，让热爱自在生长。</p>
        </section>
      </div>
      <footer>
        同好交流论坛 <span>一个有边界，也有温度的小社区</span>
      </footer>
    </main>
  );
}
function Growth({ u, c, checked, perform, go }: any) {
  const next = [c.post_threshold, c.comment_threshold, c.locked_threshold]
    .sort((a, b) => a - b)
    .find((v) => v > u.points);
  return (
    <section className="growth-card">
      <div className="growth-top">
        <Avatar user={u} />
        <div>
          <strong>{u.username}</strong>
          <span className="level-badge">{level(u, c)}</span>
        </div>
      </div>
      <span className="muted">我的成长积分</span>
      <div className="points-number">
        {u.points}
        <small>积分</small>
        <span>✦</span>
      </div>
      <Progress
        value={next ? Math.min(100, (Math.max(0, u.points) / next) * 100) : 100}
      />
      <p className="growth-next">
        {u.role === 'admin'
          ? '已拥有全部管理权限'
          : next
            ? `再积攒 ${Math.max(0, next - u.points)} 分，解锁更多社区权限`
            : '全部普通用户权限已解锁'}
      </p>
      <button
        className={'checkin-button ' + (checked ? 'done' : '')}
        disabled={checked}
        onClick={() =>
          perform(() => api('checkin', 'POST', {}), '签到成功，积分已到账')
        }
      >
        <CalendarCheck size={17} />
        {checked ? '今天已签到' : '每日签到'}
        <span>+{c.checkin_points}</span>
      </button>
      <button className="text-link" onClick={() => go('/points')}>
        查看积分与成长规则 <ChevronRight size={14} />
      </button>
    </section>
  );
}
function PostCard({ p, go }: any) {
  const Icon = icons[p.category];
  return (
    <article className={'post-card ' + (p.cover ? 'has-media' : '')}>
      <div className="post-card-main">
        <div className="post-meta">
          <button
            className="author-link"
            onClick={() => go('/user/' + p.author.id)}
          >
            <Avatar user={p.author} size="tiny" />
            <span>{p.author.username}</span>
          </button>
          <span>·</span>
          <time>{date(p.created_at)}</time>
          <span className={'category-badge ' + p.category}>
            <Icon size={12} />
            {categories[p.category].name}
          </span>
        </div>
        <button className="post-open" onClick={() => go('/post/' + p.id)}>
          <h3>
            {p.pinned && <Pin size={15} />} {p.title}
          </h3>
          <p>{p.excerpt || '查看这份分享'}</p>
        </button>
        <div className="post-bottom">
          <span>
            <Eye size={14} />
            {p.view_count}
          </span>
          <span>
            <MessageCircle size={14} />
            {p.comment_count}
          </span>
          <span>
            <ThumbsUp size={14} />
            {p.like_count}
          </span>
          {p.has_locked && (
            <span className="locked-tag">
              <LockKeyhole size={12} /> 含待解锁内容
            </span>
          )}
          {p.tags.slice(0, 2).map((v: string) => (
            <span className="tag" key={v}>
              # {v}
            </span>
          ))}
        </div>
      </div>
      {p.cover && (
        <button className="post-cover" onClick={() => go('/post/' + p.id)}>
          {p.cover_type === 'video' ? (
            p.thumbnail ? (
              <img src={p.thumbnail} alt={p.title} />
            ) : (
              <span className="video-placeholder">
                <Video size={32} />
              </span>
            )
          ) : (
            <img src={p.cover} alt={p.title} loading="lazy" />
          )}
          {p.cover_type === 'video' && <span className="play-chip">▶</span>}
        </button>
      )}
    </article>
  );
}
function Feed({ u, c, go, category, path, checked, perform, revision }: any) {
  const [data, setData] = useState<any>({ posts: [], total: 0 }),
    [hot, setHot] = useState<any[]>([]),
    [sort, setSort] = useState('latest'),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const query = new URL('http://local' + path).searchParams.get('search') || '';
  useEffect(() => setOffset(0), [category, query, sort]);
  useEffect(() => {
    setBusy(true);
    api(
      `posts?category=${category}&sort=${sort}&search=${encodeURIComponent(query)}&offset=${offset}`,
    )
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
    api('posts?sort=hot')
      .then((d) => setHot(d.posts.slice(0, 4)))
      .catch(() => {});
  }, [category, query, sort, offset, revision]);
  return (
    <div className="feed-layout">
      <section className="feed-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {query
                ? '找到同频的分享'
                : category
                  ? '我们的分享角落'
                  : 'OUR LITTLE COMMUNITY'}
            </span>
            <h1>
              {query
                ? '搜索「' + query + '」'
                : categories[category]?.name || '今天，也有新的喜欢'}
            </h1>
            <p>
              {categories[category]?.description ||
                '把热爱放在这里，让同频的人看见。'}
            </p>
          </div>
          <span className="heading-decoration">
            <Heart size={30} />
          </span>
        </div>
        {!category && !query && (
          <div className="category-grid">
            {Object.entries(categories).map(([k, v]: any) => {
              const Icon = icons[k];
              return (
                <button
                  key={k}
                  className={'category-entry ' + k}
                  onClick={() => go('/category/' + k)}
                >
                  <span>
                    <Icon size={23} />
                    <ArrowRight size={15} />
                  </span>
                  <strong>{v.name}</strong>
                  <small>{v.description}</small>
                </button>
              );
            })}
          </div>
        )}
        <div className="feed-toolbar">
          <Tabs value={sort} onValueChange={(v) => setSort(String(v))}>
            <TabsList variant="line">
              <TabsTrigger value="latest">最新发布</TabsTrigger>
              <TabsTrigger value="hot">热门讨论</TabsTrigger>
            </TabsList>
          </Tabs>
          <span>{data.total} 篇分享</span>
        </div>
        {error && <Hint>{error}</Hint>}
        {busy ? (
          <div className="loading-line">
            <LoaderCircle size={18} className="spin" />
            正在寻找新分享…
          </div>
        ) : data.posts.length ? (
          <div className={category === 'image' ? 'image-feed' : ''}>
            {data.posts.map((p: any) => (
              <PostCard key={p.id} p={p} go={go} />
            ))}
          </div>
        ) : (
          <Empty
            title={query ? '暂时没有找到相关帖子' : '第一份分享，等你开启'}
            text={
              query
                ? '试试其他关键词，或去板块里逛逛。'
                : '先签到积攒积分，再把喜欢的文字与瞬间放在这里。'
            }
          >
            <button className="secondary" onClick={() => go('/points')}>
              看看如何解锁发帖 <ArrowRight size={15} />
            </button>
          </Empty>
        )}
        {data.total > 24 && (
          <div className="pagination">
            <button
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 24))}
            >
              上一页
            </button>
            <span>
              {offset / 24 + 1} / {Math.ceil(data.total / 24)}
            </span>
            <button
              disabled={offset + 24 >= data.total}
              onClick={() => setOffset(offset + 24)}
            >
              下一页
            </button>
          </div>
        )}
      </section>
      <aside className="right-column">
        <Growth {...{ u, c, checked, perform, go }} />
        <section className="side-card">
          <h3>
            <MessagesSquare size={17} /> 正在被关注
          </h3>
          {hot.length ? (
            hot.map((p: any, i: number) => (
              <button
                key={p.id}
                className="hot-row"
                onClick={() => go('/post/' + p.id)}
              >
                <span>0{i + 1}</span>
                <div>
                  <strong>{p.title}</strong>
                  <small>
                    {p.comment_count} 条评论 · {categories[p.category].name}
                  </small>
                </div>
              </button>
            ))
          ) : (
            <p className="muted side-empty">新的讨论，会从这里开始。</p>
          )}
        </section>
        <section className="side-card community-note">
          <span className="eyebrow">社区小约定</span>
          <h3>因为喜欢，所以珍惜</h3>
          <p>
            尊重不同声音，认真回应分享。
            <br />
            转载请注明来源，私密内容请勿外传。
          </p>
          <span>♡ 在这里，安心做自己</span>
        </section>
      </aside>
    </div>
  );
}
function PostDetail({
  id,
  u,
  c,
  go,
  perform,
  act,
  ask,
  revision,
  setNotice,
}: any) {
  const [p, setP] = useState<any>(null),
    [error, setError] = useState(''),
    [comment, setComment] = useState(''),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  useEffect(() => {
    setP(null);
    api('posts/' + id + '?comment_offset=' + page)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [id, revision, u.points, c.locked_threshold, page]);
  if (error) return <Empty title="暂时无法查看" text={error} />;
  if (!p) return <div className="loading-line">正在打开帖子…</div>;
  const owner = p.author.id === u.id || u.role === 'admin';
  return (
    <div className="detail-layout">
      <section>
        <button
          className="back-link"
          onClick={() => go('/category/' + p.category)}
        >
          <ArrowLeft size={16} />
          {categories[p.category].name}
        </button>
        <article className="detail-card">
          <div className="detail-labels">
            <span className={'category-badge ' + p.category}>
              {categories[p.category].name}
            </span>
            {p.pinned && (
              <span className="tag">
                <Pin size={12} /> 置顶
              </span>
            )}
            {p.status !== 'published' && (
              <span className="tag">
                {p.status === 'hidden' ? '已隐藏' : '已删除'}
              </span>
            )}
          </div>
          <h1>{p.title}</h1>
          <div className="detail-author">
            <button
              className="author-link"
              onClick={() => go('/user/' + p.author.id)}
            >
              <Avatar user={p.author} />
              <span>
                <strong>{p.author.username}</strong>
                <small>{date(p.created_at)} 发布</small>
              </span>
            </button>
            <span className="muted">
              <Eye size={15} />
              {p.view_count} 次浏览
            </span>
          </div>
          {u.role === 'admin' && (
            <div className="admin-author-info">
              <ShieldCheck size={16} />
              <span>
                作者邮箱：{p.author.email}
                <br />
                用户ID：{p.author.id} · 账号
                {p.author.account_status === 'banned' ? '已封禁' : '正常'}
                <br />
                帖子ID：{p.id}
              </span>
            </div>
          )}
          <div className="post-body">
            {p.blocks.map((b: any) =>
              b.locked ? (
                <div className="locked-block" key={b.id}>
                  <span className="lock-circle">
                    <LockKeyhole size={24} />
                  </span>
                  <h3>还有一份喜欢，等待解锁</h3>
                  <p>该部分内容需要积分达到{b.required_points}分后解锁查看。</p>
                  <div>
                    当前积分 <strong>{b.current_points}</strong>
                    <span>·</span>还差 <strong>{b.points_needed}</strong> 分
                  </div>
                  <button className="text-link" onClick={() => go('/points')}>
                    查看积分获取方式 <ArrowRight size={14} />
                  </button>
                </div>
              ) : (
                <div
                  className={
                    'content-block ' + (b.is_locked ? 'unlocked-block' : '')
                  }
                  key={b.id}
                >
                  {b.is_locked && (
                    <div className="unlocked-label">
                      <Unlock size={13} /> 待解锁内容 · 你有权查看
                    </div>
                  )}
                  {b.block_type === 'text' ? (
                    <p className="body-text">{b.content}</p>
                  ) : b.block_type === 'image' ? (
                    <figure>
                      <img
                        src={b.url}
                        alt={b.content || p.title}
                        loading="lazy"
                      />
                      {b.content && <figcaption>{b.content}</figcaption>}
                    </figure>
                  ) : (
                    <figure>
                      <video
                        src={b.url}
                        controls
                        playsInline
                        preload="metadata"
                        poster={b.cover_url || undefined}
                      />
                      {b.content && <figcaption>{b.content}</figcaption>}
                    </figure>
                  )}
                </div>
              ),
            )}
          </div>
          <div className="detail-tags">
            {p.tags.map((t: string) => (
              <span className="tag" key={t}>
                # {t}
              </span>
            ))}
          </div>
          <div className="detail-actions">
            <button
              className={'secondary ' + (p.liked ? 'liked' : '')}
              onClick={() =>
                perform(() =>
                  api('posts/' + id + '/like', 'POST', { liked: !p.liked }),
                )
              }
            >
              <ThumbsUp size={16} />
              {p.liked ? '已喜欢' : '喜欢'} · {p.like_count}
            </button>
            {owner && (
              <div>
                <button className="text-link" onClick={() => go('/edit/' + id)}>
                  <Pencil size={15} /> 编辑
                </button>
                <button
                  className="text-link danger"
                  onClick={() =>
                    ask(
                      '删除这篇帖子？',
                      '删除后将移除内容。自己发布内容获得的积分会自动扣回。',
                      (deduct: boolean) =>
                        api('posts/' + id, 'DELETE', { deduct }),
                      u.role === 'admin' && p.author.id !== u.id,
                    )
                  }
                >
                  <Trash2 size={15} />
                  删除
                </button>
              </div>
            )}
          </div>
        </article>
        <section className="comments-card">
          <h2>
            一起聊聊 <span>{p.comment_count}</span>
          </h2>
          {u.permissions.comment ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const d = await act(() =>
                    api('posts/' + id + '/comments', 'POST', {
                      content: comment,
                    }),
                  );
                  setComment('');
                  setNotice(
                    d.message + (d.awarded ? ' +' + d.awarded + '积分' : ''),
                  );
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              <textarea
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="留下你的共鸣，让分享被认真回应。"
                rows={3}
                maxLength={10000}
              />
              <div className="comment-submit">
                <small>
                  有效字符 {effective(comment)} · 每日最多奖励
                  {c.comment_daily_cap}分
                </small>
                <button
                  className="primary small"
                  disabled={busy || !effective(comment)}
                >
                  发布评论
                </button>
              </div>
            </form>
          ) : (
            <Hint>
              你的积分不足{c.comment_threshold}分，暂未解锁评论功能。
              <button className="text-link" onClick={() => go('/points')}>
                查看成长规则 →
              </button>
            </Hint>
          )}
          {p.comments.length ? (
            p.comments.map((v: any) => (
              <div className="comment" key={v.id}>
                <button onClick={() => go('/user/' + v.user_id)}>
                  <Avatar user={{ username: v.username, avatar: v.avatar }} />
                </button>
                <div>
                  <div className="comment-heading">
                    <strong>{v.username}</strong>
                    <time>{date(v.created_at)}</time>
                  </div>
                  <p>{v.content}</p>
                  {(v.user_id === u.id || u.role === 'admin') && (
                    <button
                      className="text-link subtle"
                      onClick={() =>
                        ask(
                          '删除这条评论？',
                          '对应已获得的积分会自动扣回。',
                          (deduct: boolean) =>
                            api('comments/' + v.id, 'DELETE', { deduct }),
                          u.role === 'admin' && v.user_id !== u.id,
                        )
                      }
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="comments-empty">还没有评论，让第一句共鸣从你开始。</p>
          )}
          {p.comment_count > 50 && (
            <div className="pagination">
              <button
                disabled={!page}
                onClick={() => setPage(Math.max(0, page - 50))}
              >
                上一页评论
              </button>
              <span>{page / 50 + 1}</span>
              <button
                disabled={page + 50 >= p.comment_count}
                onClick={() => setPage(page + 50)}
              >
                下一页评论
              </button>
            </div>
          )}
        </section>
      </section>
      <aside className="right-column">
        <section className="side-card author-card">
          <Avatar user={p.author} size="large" />
          <h3>{p.author.username}</h3>
          <p className="muted">在这里，分享每一份喜欢。</p>
          <button
            className="secondary"
            onClick={() => go('/user/' + p.author.id)}
          >
            访问主页 <ArrowRight size={15} />
          </button>
        </section>
        <section className="side-card community-note">
          <LockKeyhole size={21} />
          <h3>只在我们之间分享</h3>
          <p>请尊重作者的创作与分享边界，不转发社区私密内容。</p>
        </section>
      </aside>
    </div>
  );
}
async function uploadFile(
  file: File,
  onProgress: (n: number) => void,
  cover?: string,
) {
  const type =
    file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name)
      ? 'video'
      : 'image';
  const m = await api('uploads/start', 'POST', {
    name: file.name,
    size: file.size,
    media_type: type,
  });
  try {
    for (
      let start = 0, part = 1;
      start < file.size;
      start += m.chunk_size, part++
    ) {
      const blob = file.slice(start, start + m.chunk_size);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/uploads/' + m.id + '/part?number=' + part);
        xhr.setRequestHeader('X-Forum-Request', '1');
        xhr.upload.onprogress = (e) =>
          onProgress(Math.round(((start + e.loaded) / file.size) * 99));
        xhr.onerror = () => reject(new Error('上传中断，请重试。'));
        xhr.onload = () => {
          try {
            const d = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) reject(new Error(d.message || '上传失败'));
            else resolve();
          } catch {
            reject(new Error('上传失败'));
          }
        };
        xhr.send(blob);
      });
    }
    const d = await api('uploads/' + m.id + '/complete', 'POST', {
      cover_id: cover,
    });
    onProgress(100);
    return d;
  } catch (e) {
    await api('uploads/' + m.id, 'DELETE', {}).catch(() => {});
    throw e;
  }
}
async function videoCover(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'),
      url = URL.createObjectURL(file);
    let ended = false;
    const finish = (err?: Error, result?: File) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      if (err) reject(err);
      else resolve(result!);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error('无法读取视频，请使用可播放的 MP4、WEBM 或 MOV 文件。'),
        ),
      20000,
    );
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      if (!video.videoWidth || !video.videoHeight)
        return finish(new Error('视频没有有效画面。'));
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(960, video.videoWidth);
      canvas.height = Math.round(
        (video.videoHeight * canvas.width) / video.videoWidth,
      );
      canvas
        .getContext('2d')!
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) =>
          b
            ? finish(
                undefined,
                new File([b], file.name + '.jpg', { type: 'image/jpeg' }),
              )
            : finish(new Error('封面生成失败')),
        'image/jpeg',
        0.85,
      );
    };
    video.onerror = () =>
      finish(
        new Error('当前视频编码无法播放，请导出为 H.264 MP4 或 WEBM 后重试。'),
      );
    video.src = url;
  });
}
function Editor({ u, c, postId, go, act, setNotice }: any) {
  const [b, setB] = useState<any>({
      category: 'article',
      title: '',
      tags: [],
      blocks: [
        {
          key: crypto.randomUUID(),
          block_type: 'text',
          content: '',
          is_locked: false,
        },
      ],
    }),
    [tags, setTags] = useState(''),
    [upload, setUpload] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const textRefs = useRef<any>({});
  useEffect(() => {
    if (postId)
      api('posts/' + postId)
        .then((p) => {
          if (p.author.id !== u.id && u.role !== 'admin')
            throw new Error('只能编辑自己发布的内容。');
          setB({
            ...p,
            blocks: p.blocks.map((v: any) => ({ ...v, key: v.id })),
          });
          setTags(p.tags.join('，'));
        })
        .catch((e) => setError(e.message));
  }, [postId]);
  if (error) return <Empty title="无法编辑" text={error} />;
  if (!postId && !u.permissions.post)
    return (
      <Empty
        title="发帖功能还在等待解锁"
        text={`你的积分不足${c.post_threshold}分，暂未解锁发帖功能。`}
      >
        <button className="primary" onClick={() => go('/points')}>
          查看成长规则
        </button>
      </Empty>
    );
  const lockAllowed =
    c.locked_enabled && c.locked_categories.includes(b.category);
  const update = (i: number, v: any) =>
    setB((x: any) => ({
      ...x,
      blocks: x.blocks.map((a: any, n: number) =>
        n === i ? { ...a, ...v } : a,
      ),
    }));
  const move = (i: number, d: number) =>
    setB((x: any) => {
      const v = [...x.blocks];
      [v[i], v[i + d]] = [v[i + d], v[i]];
      return { ...x, blocks: v };
    });
  async function files(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    for (const file of Array.from(list)) {
      try {
        setUpload({ name: file.name, progress: 0 });
        let cover;
        if (/\.(mp4|webm|mov)$/i.test(file.name)) {
          const img = await videoCover(file);
          cover = (await uploadFile(img, () => {})).id;
        }
        const m = await uploadFile(
          file,
          (n) => setUpload({ name: file.name, progress: n }),
          cover,
        );
        setB((x: any) => ({
          ...x,
          blocks: [
            ...x.blocks,
            {
              key: crypto.randomUUID(),
              block_type: m.media_type,
              media_id: m.id,
              url: m.url,
              cover_url: m.cover_url,
              is_locked: false,
              content: '',
            },
          ],
        }));
      } catch (e: any) {
        setNotice(e.message);
      }
    }
    setUpload(null);
    setBusy(false);
  }
  function lockSelection(i: number) {
    const t = textRefs.current[i],
      v = b.blocks[i];
    if (!t || t.selectionStart === t.selectionEnd) {
      update(i, { is_locked: !v.is_locked });
      return;
    }
    const start = t.selectionStart,
      end = t.selectionEnd;
    const segments = [
      { text: v.content.slice(0, start), lock: v.is_locked },
      { text: v.content.slice(start, end), lock: true },
      { text: v.content.slice(end), lock: v.is_locked },
    ]
      .filter((x) => x.text)
      .map((x) => ({
        key: crypto.randomUUID(),
        block_type: 'text',
        content: x.text,
        is_locked: x.lock,
      }));
    setB({
      ...b,
      blocks: [...b.blocks.slice(0, i), ...segments, ...b.blocks.slice(i + 1)],
    });
  }
  async function submit(e: any) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await act(() =>
        api(postId ? 'posts/' + postId : 'posts', postId ? 'PATCH' : 'POST', {
          ...b,
          tags: tags
            .split(/[,，]/)
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      );
      go('/post/' + (postId || d.id));
      setNotice(
        postId
          ? '修改已保存'
          : d.message + (d.awarded ? ' +' + d.awarded + '积分' : ''),
      );
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor-layout">
      <section>
        <button
          className="back-link"
          onClick={() => go(postId ? '/post/' + postId : '/')}
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <form className="editor-card" onSubmit={submit}>
          <div className="editor-heading">
            <h1>{postId ? '编辑分享' : '把喜欢，分享出来'}</h1>
            <span>认真创作，每份热爱都值得被看见</span>
          </div>
          <label>
            发布到
            <NativeSelect
              value={b.category}
              disabled={!!postId}
              onChange={(e) => setB({ ...b, category: e.target.value })}
            >
              {Object.entries(categories).map(([k, v]: any) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <input
            className="title-input"
            required
            maxLength={160}
            value={b.title}
            onChange={(e) => setB({ ...b, title: e.target.value })}
            placeholder="为这份分享起个标题"
            aria-label="帖子标题"
          />
          <div className="block-list">
            {b.blocks.map((v: any, i: number) => (
              <section
                key={v.key}
                className={'editor-block ' + (v.is_locked ? 'is-locked' : '')}
              >
                <header>
                  <span>
                    {v.block_type === 'text' ? (
                      <Type size={15} />
                    ) : v.block_type === 'image' ? (
                      <ImageIcon size={15} />
                    ) : (
                      <Video size={15} />
                    )}
                    内容块 {i + 1}
                  </span>
                  <div>
                    {(lockAllowed || v.is_locked) && (
                      <label className="check-label">
                        <Checkbox
                          checked={v.is_locked}
                          onCheckedChange={(value) =>
                            update(i, { is_locked: !!value })
                          }
                        />
                        待解锁内容
                      </label>
                    )}
                    <button
                      type="button"
                      aria-label="上移"
                      disabled={!i}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      disabled={i === b.blocks.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="删除内容块"
                      onClick={() => {
                        setB({
                          ...b,
                          blocks: b.blocks.filter(
                            (_: any, n: number) => n !== i,
                          ),
                        });
                        if (v.media_id && !v.id)
                          api('uploads/' + v.media_id, 'DELETE', {}).catch(
                            (e: any) => setNotice(e.message),
                          );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </header>
                {v.block_type === 'text' ? (
                  <>
                    <textarea
                      ref={(el) => {
                        textRefs.current[i] = el;
                      }}
                      rows={5}
                      value={v.content}
                      onChange={(e) => update(i, { content: e.target.value })}
                      placeholder={
                        b.category === 'image'
                          ? '写下图片简介或说明…'
                          : '从这里写下想分享的内容…'
                      }
                      maxLength={100000}
                    />
                    {lockAllowed && (
                      <button
                        type="button"
                        className="selection-lock"
                        onClick={() => lockSelection(i)}
                      >
                        <LockKeyhole size={13} />
                        将选中文字设为待解锁内容
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="editor-media">
                      {v.block_type === 'image' ? (
                        <img src={v.url} alt="上传图片预览" />
                      ) : (
                        <video
                          src={v.url}
                          poster={v.cover_url || undefined}
                          controls
                          preload="metadata"
                        />
                      )}
                    </div>
                    <input
                      value={v.content || ''}
                      onChange={(e) => update(i, { content: e.target.value })}
                      placeholder="为这段画面添加说明（选填）"
                      aria-label="图片或视频说明"
                    />
                  </>
                )}
              </section>
            ))}
          </div>
          <div className="editor-tools">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setB({
                  ...b,
                  blocks: [
                    ...b.blocks,
                    {
                      key: crypto.randomUUID(),
                      block_type: 'text',
                      content: '',
                      is_locked: false,
                    },
                  ],
                })
              }
            >
              <Type size={16} />
              添加文字
            </button>
            <label className="secondary upload-label">
              <ImagePlus size={16} />
              添加图片
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif"
                multiple
                disabled={busy}
                onChange={(e) => {
                  files(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            {b.category === 'video' && (
              <label className="secondary upload-label">
                <Video size={16} />
                添加视频
                <input
                  type="file"
                  accept=".mp4,.webm,.mov"
                  multiple
                  disabled={busy}
                  onChange={(e) => {
                    files(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
          {upload && (
            <div className="upload-progress">
              <span>
                {upload.name} · {upload.progress}%
              </span>
              <Progress value={upload.progress} />
            </div>
          )}
          <label>
            标签
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="用逗号分隔，例如：随想，日常，创作"
            />
          </label>
          <div className="editor-submit">
            <span>
              公开文字{' '}
              {b.blocks
                .filter((x: any) => !x.is_locked && x.block_type === 'text')
                .reduce(
                  (n: number, x: any) => n + effective(x.content),
                  0,
                )}{' '}
              字
            </span>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Plus size={17} />
              )}{' '}
              {postId ? '保存修改' : '发布分享'}
            </button>
          </div>
        </form>
      </section>
      <aside className="right-column">
        <section className="side-card editor-guide">
          <h3>分享小贴士</h3>
          <p>
            发文区以文字为主，发图区至少上传一张图片并填写简介，视频区需上传可播放的视频。
          </p>
          <div>
            <ImageIcon size={18} />
            <p>
              单张图片 ≤ {c.image_max_mb}MB
              <br />
              每帖最多 {c.image_max_count} 张
            </p>
          </div>
          <div>
            <Video size={18} />
            <p>
              单个视频 ≤ {c.video_max_mb}MB
              <br />
              每帖最多 {c.video_max_count} 个<br />
              上传时自动生成封面
            </p>
          </div>
          <div>
            <LockKeyhole size={18} />
            <p>
              发文区与发图区可以设置待解锁内容。达到 {c.locked_threshold}{' '}
              分的成员自动可见，无需消耗积分。
            </p>
          </div>
          <Hint>
            含待解锁内容时，文章至少保留 {c.min_public_chars}{' '}
            个公开有效字符；图区至少保留 {c.min_public_images}{' '}
            张公开图片和简介。
          </Hint>
        </section>
      </aside>
    </div>
  );
}
function Profile({ id, u, c, go, revision, setNotice, act }: any) {
  const [p, setP] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0);
  useEffect(() => {
    api('users/' + id + '?offset=' + page)
      .then(setP)
      .catch((e) => setNotice(e.message));
  }, [id, revision, page]);
  if (!p) return <div className="loading-line">正在打开个人主页…</div>;
  return (
    <div className="profile-layout">
      <section className="profile-header">
        <div className="profile-stripe" />
        <div className="profile-info">
          <Avatar user={p} size="xl" />
          <div>
            <h1>
              {p.username}
              <span className="level-badge">{level(p, c)}</span>
            </h1>
            <p className="muted">
              加入于 {new Date(p.created_at).toLocaleDateString('zh-CN')}
            </p>
            {p.email && (
              <p className="profile-email">
                {p.email} <span>仅本人和管理员可见</span>
              </p>
            )}
          </div>
          {id === u.id && (
            <label className="secondary upload-label">
              {busy ? '上传中…' : '更换头像'}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const m = await uploadFile(file, () => {});
                    await act(
                      () => api('me/avatar', 'POST', { media_id: m.id }),
                      '头像已更新',
                    );
                  } catch (e: any) {
                    setNotice(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
        </div>
        <div className="profile-stats">
          <div>
            <strong>{p.points}</strong>
            <span>成长积分</span>
          </div>
          <div>
            <strong>{p.post_count}</strong>
            <span>篇分享</span>
          </div>
          <div>
            <strong>{p.comment_count}</strong>
            <span>条评论</span>
          </div>
          {id === u.id && (
            <button className="text-link" onClick={() => go('/points')}>
              查看积分记录 <ArrowRight size={15} />
            </button>
          )}
        </div>
      </section>
      <h2 className="section-title">{id === u.id ? '我的分享' : 'TA的分享'}</h2>
      {p.posts.length ? (
        p.posts.map((x: any) => <PostCard p={x} key={x.id} go={go} />)
      ) : (
        <Empty title="分享，是认识彼此的开始" text="这里还没有发布过帖子。" />
      )}
      {p.post_count > 50 && (
        <div className="pagination">
          <button
            disabled={!page}
            onClick={() => setPage(Math.max(0, page - 50))}
          >
            上一页
          </button>
          <span>{page / 50 + 1}</span>
          <button
            disabled={page + 50 >= p.post_count}
            onClick={() => setPage(page + 50)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
const pointNames: any = {
  checkin: '每日签到',
  post_article: '发文区发布帖子',
  post_image: '发图区发布图片',
  post_video: '视频区发布视频',
  post_chat: '水区发帖',
  comment: '发布有效评论',
  admin_adjust: '管理员调整积分',
  post_article_rollback: '删除文章，积分扣回',
  post_image_rollback: '删除图片帖，积分扣回',
  post_video_rollback: '删除视频帖，积分扣回',
  post_chat_rollback: '删除水区帖，积分扣回',
  comment_rollback: '删除评论，积分扣回',
};
function Points({ u, c, revision }: any) {
  const [data, setData] = useState<any>({ transactions: [] }),
    [page, setPage] = useState(0);
  useEffect(() => {
    api('me/points?offset=' + page)
      .then(setData)
      .catch(() => {});
  }, [revision, page]);
  return (
    <div className="points-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">每次认真参与，都算数</span>
          <h1>我的成长记录</h1>
          <p>积分解锁权限，查看内容不会消耗积分。</p>
        </div>
        <div className="points-summary">
          <strong>{u.points}</strong>
          <span>当前总积分</span>
        </div>
      </div>
      <div className="milestones">
        {[
          [c.post_threshold, '解锁发帖', '在四大板块发布分享'],
          [c.comment_threshold, '解锁评论', '把你的共鸣留在评论区'],
          [c.locked_threshold, '解锁私密内容', '查看文区和图区待解锁内容'],
        ].map(([n, t, d]) => (
          <div
            key={String(t)}
            className={
              u.points >= Number(n) || u.role === 'admin' ? 'achieved' : ''
            }
          >
            <span>
              {u.points >= Number(n) || u.role === 'admin' ? (
                <Check size={18} />
              ) : (
                <LockKeyhole size={18} />
              )}
            </span>
            <div>
              <strong>
                {t} · {n}分
              </strong>
              <p>{d}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="rules-card">
        <h3>积分可以这样获得</h3>
        <div className="rule-grid">
          {[
            ['每日签到', c.checkin_points, '每天一次'],
            [
              '发文 / 图片 / 视频',
              `${c.article_points} / ${c.image_points} / ${c.video_points}`,
              '发布有效内容',
            ],
            ['水区发帖', c.chat_points, `每天最多奖励${c.chat_daily_limit}帖`],
            [
              '短评论 / 长评论',
              `${c.short_comment_points} / ${c.long_comment_points}`,
              `20字起算长评，每日总奖励最多${c.comment_daily_cap}分`,
            ],
          ].map(([t, n, d]) => (
            <div key={String(t)}>
              <span>{t}</span>
              <strong>+{n}</strong>
              <small>{d}</small>
            </div>
          ))}
        </div>
        <Hint>
          重复内容不重复奖励；删除已获积分的内容，会扣回实际获得的积分。超过每日奖励上限后，仍可正常发布内容。
        </Hint>
      </section>
      <section className="ledger">
        <h2>积分流水</h2>
        {data.transactions.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>积分来源</TableHead>
                <TableHead>变动</TableHead>
                <TableHead>变动后积分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transactions.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell>{date(v.created_at)}</TableCell>
                  <TableCell>
                    {pointNames[v.type] || v.type}
                    <small className="source-id">来源：{v.source_id}</small>
                  </TableCell>
                  <TableCell
                    className={
                      v.amount > 0
                        ? 'positive'
                        : v.amount < 0
                          ? 'danger'
                          : 'muted'
                    }
                  >
                    {v.amount > 0 ? '+' : ''}
                    {v.amount}
                  </TableCell>
                  <TableCell>{v.balance_after}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty
            title="你的第一笔积分，即将开始"
            text="完成今天的签到，即可获得成长积分。"
          />
        )}
        <div className="pagination">
          <button
            disabled={!page}
            onClick={() => setPage(Math.max(0, page - 100))}
          >
            上一页
          </button>
          <span>第 {page / 100 + 1} 页</span>
          <button
            disabled={data.transactions.length < 100}
            onClick={() => setPage(page + 100)}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
function Admin({ u, c, go, act, perform, ask, revision, setNotice }: any) {
  const [tab, setTab] = useState('users'),
    [data, setData] = useState<any>({}),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState({ category: '', from: '', to: '' }),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<any>(null),
    [draft, setDraft] = useState<any>(c),
    [questions, setQuestions] = useState<any[]>([]),
    [form, setForm] = useState<any>({
      points: 0,
      reason: '',
      start_at: '',
      end_at: '',
      permanent: true,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setPage(0);
    setSelected(null);
    setError('');
  }, [tab, search, filter]);
  useEffect(() => {
    if (tab === 'settings') {
      setDraft(c);
      return;
    }
    const qs = new URLSearchParams({ search, offset: String(page), ...filter });
    api('admin/' + tab + '?' + qs)
      .then((d) => {
        setData(d);
        if (tab === 'quiz') setQuestions(d.questions);
      })
      .catch((e) => setError(e.message));
  }, [tab, revision, search, filter, page]);
  const select = (v: any) => {
    setSelected(v);
    setForm({
      points: v.points,
      reason: '',
      start_at: '',
      end_at: '',
      permanent: true,
    });
  };
  const settingsGroups: any = [
    [
      '积分奖励',
      [
        ['checkin_points', '签到积分'],
        ['short_comment_points', '短评论积分'],
        ['long_comment_points', '长评论积分'],
        ['article_points', '发文区积分'],
        ['image_points', '发图区积分'],
        ['video_points', '视频区积分'],
        ['chat_points', '水区积分'],
      ],
    ],
    [
      '权限与防刷',
      [
        ['post_threshold', '发帖解锁积分'],
        ['comment_threshold', '评论解锁积分'],
        ['comment_daily_cap', '每日评论积分上限'],
        ['chat_daily_limit', '每日水区奖励帖子数'],
      ],
    ],
    [
      '待解锁内容',
      [
        ['locked_threshold', '待解锁积分门槛'],
        ['min_public_chars', '发文区最低公开有效字数'],
        ['min_public_images', '发图区最低公开图片数'],
      ],
    ],
    [
      '媒体上传',
      [
        ['image_max_mb', '单张图片大小上限（MB）'],
        ['image_max_count', '每帖图片数量上限'],
        ['video_max_mb', '单个视频大小上限（MB）'],
        ['video_max_count', '每帖视频数量上限'],
      ],
    ],
    [
      '准入题目',
      [
        ['quiz_pass_score', '通过分数'],
        ['quiz_draw_count', '每次随机抽题数量'],
      ],
    ],
  ];
  async function save(fn: () => Promise<any>) {
    setBusy(true);
    try {
      await act(fn, '设置已保存并立即生效');
    } catch {
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">一起维护我们的社区</span>
          <h1>管理后台</h1>
          <p>成员、内容与成长规则，都在这里管理。</p>
        </div>
        <span className="admin-shield">
          <ShieldCheck size={30} />
        </span>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="admin-tabs">
          {[
            ['users', '用户管理', Users],
            ['posts', '帖子管理', FileText],
            ['comments', '评论管理', MessageCircle],
            ['settings', '积分与等级设置', Settings],
            ['quiz', '准入答题', LockKeyhole],
            ['logs', '操作日志', ScrollText],
          ].map(([k, t, Icon]: any) => (
            <TabsTrigger key={k} value={k}>
              <Icon size={15} />
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {error && <Hint>{error}</Hint>}
      {['users', 'posts'].includes(tab) && (
        <div className="admin-filters">
          <div className="filter-search">
            <Search size={17} />
            <input
              placeholder={
                tab === 'users'
                  ? '搜索用户名、邮箱或用户ID'
                  : '搜索标题、用户名或用户ID'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {tab === 'posts' && (
            <>
              <NativeSelect
                value={filter.category}
                onChange={(e) =>
                  setFilter({ ...filter, category: e.target.value })
                }
              >
                <option value="">全部板块</option>
                {Object.entries(categories).map(([k, v]: any) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect>
              <label>
                开始日期
                <input
                  type="date"
                  value={filter.from}
                  onChange={(e) =>
                    setFilter({ ...filter, from: e.target.value })
                  }
                />
              </label>
              <label>
                结束日期
                <input
                  type="date"
                  value={filter.to}
                  onChange={(e) => setFilter({ ...filter, to: e.target.value })}
                />
              </label>
            </>
          )}
        </div>
      )}
      {tab === 'users' && (
        <>
          <section className="admin-table">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    '用户',
                    '注册邮箱',
                    '积分',
                    '帖子 / 评论',
                    '账号状态',
                    '最近登录',
                    '操作',
                  ].map((t) => (
                    <TableHead key={t}>{t}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users?.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="table-user">
                        <Avatar user={v} />
                        <div>
                          <strong>{v.username}</strong>
                          <small>{v.id}</small>
                          <small>注册 {date(v.created_at)}</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{v.email}</TableCell>
                    <TableCell>{v.points}</TableCell>
                    <TableCell>
                      {v.post_count} / {v.comment_count}
                    </TableCell>
                    <TableCell>
                      <span className={'status ' + v.account_status}>
                        {v.account_status === 'banned' ? '封禁中' : '正常'}
                      </span>
                    </TableCell>
                    <TableCell>{date(v.last_login_at)}</TableCell>
                    <TableCell>
                      <button className="text-link" onClick={() => select(v)}>
                        管理
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!data.users?.length && (
              <Empty title="没有找到成员" text="更换搜索条件后再试。" />
            )}
          </section>
          {selected && (
            <section className="member-editor">
              <div className="section-bar">
                <h2>管理 {selected.username}</h2>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="关闭用户管理"
                >
                  <X size={18} />
                </button>
              </div>
              <button
                className="text-link"
                onClick={() => go('/user/' + selected.id)}
              >
                查看个人主页 →
              </button>
              <div className="member-actions">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(() =>
                      api('admin/users/' + selected.id, 'PATCH', {
                        action: 'points',
                        points: Number(form.points),
                        reason: form.reason,
                      }),
                    );
                  }}
                >
                  <h3>调整积分</h3>
                  <label>
                    当前总积分
                    <input
                      type="number"
                      min={0}
                      max={10000000}
                      required
                      value={form.points}
                      onChange={(e) =>
                        setForm({ ...form, points: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    调整原因
                    <input
                      value={form.reason}
                      onChange={(e) =>
                        setForm({ ...form, reason: e.target.value })
                      }
                      placeholder="记录这次调整的原因"
                    />
                  </label>
                  <button className="primary small" disabled={busy}>
                    保存积分
                  </button>
                </form>
                {selected.role !== 'admin' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      ask(
                        '确认封禁 ' + selected.username + '？',
                        '封禁生效后，该用户不能发帖、评论、签到或获得积分。',
                        () =>
                          api('admin/users/' + selected.id, 'PATCH', {
                            action: 'ban',
                            reason: form.reason,
                            start_at: form.start_at
                              ? new Date(form.start_at).toISOString()
                              : null,
                            end_at: form.permanent
                              ? null
                              : form.end_at
                                ? new Date(form.end_at).toISOString()
                                : null,
                          }),
                      );
                    }}
                  >
                    <h3>账号封禁</h3>
                    <label>
                      封禁原因
                      <input
                        required
                        value={form.reason}
                        onChange={(e) =>
                          setForm({ ...form, reason: e.target.value })
                        }
                        placeholder="向用户说明封禁原因"
                      />
                    </label>
                    <label>
                      生效时间（留空立即生效）
                      <input
                        type="datetime-local"
                        value={form.start_at}
                        onChange={(e) =>
                          setForm({ ...form, start_at: e.target.value })
                        }
                      />
                    </label>
                    <label className="check-label">
                      <Checkbox
                        checked={form.permanent}
                        onCheckedChange={(v) =>
                          setForm({ ...form, permanent: !!v })
                        }
                      />
                      永久封禁
                    </label>
                    {!form.permanent && (
                      <label>
                        结束时间
                        <input
                          type="datetime-local"
                          required
                          value={form.end_at}
                          onChange={(e) =>
                            setForm({ ...form, end_at: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <div className="row-actions">
                      <button className="secondary danger" type="submit">
                        封禁账号
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          ask(
                            '解除账号封禁？',
                            '解封后恢复原有积分和对应权限。',
                            () =>
                              api('admin/users/' + selected.id, 'PATCH', {
                                action: 'unban',
                              }),
                          )
                        }
                      >
                        解除封禁
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {tab === 'posts' && (
        <section className="admin-table">
          <Table>
            <TableHeader>
              <TableRow>
                {['帖子 / 作者', '板块', '发布时间', '状态', '管理操作'].map(
                  (t) => (
                    <TableHead key={t}>{t}</TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.posts?.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      className="table-title"
                      onClick={() => go('/post/' + p.id)}
                    >
                      {p.pinned && '📌 '}
                      {p.title}
                    </button>
                    <small>
                      {p.author.username} · {p.author.email}
                    </small>
                    <small>{p.author.id}</small>
                  </TableCell>
                  <TableCell>{categories[p.category].name}</TableCell>
                  <TableCell>{date(p.created_at)}</TableCell>
                  <TableCell>
                    {
                      (
                        {
                          published: '已发布',
                          hidden: '已隐藏',
                          deleted: '已删除',
                        } as any
                      )[p.status]
                    }
                  </TableCell>
                  <TableCell>
                    <div className="table-actions">
                      <button onClick={() => go('/post/' + p.id)}>查看</button>
                      {p.status !== 'deleted' && (
                        <button onClick={() => go('/edit/' + p.id)}>
                          编辑
                        </button>
                      )}
                      <button
                        onClick={() =>
                          perform(
                            () =>
                              api('admin/posts/' + p.id, 'PATCH', {
                                action:
                                  p.status === 'published' ? 'hide' : 'restore',
                              }),
                            '帖子状态已更新',
                          )
                        }
                      >
                        {p.status === 'published' ? '隐藏' : '恢复'}
                      </button>
                      <button
                        onClick={() =>
                          perform(
                            () =>
                              api('admin/posts/' + p.id, 'PATCH', {
                                action: p.pinned ? 'unpin' : 'pin',
                              }),
                            '置顶状态已更新',
                          )
                        }
                      >
                        {p.pinned ? '取消置顶' : '置顶'}
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          ask(
                            '删除帖子「' + p.title + '」？',
                            '请选择是否同时扣除该内容获得的积分。',
                            (deduct: boolean) =>
                              api('posts/' + p.id, 'DELETE', { deduct }),
                            true,
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.posts?.length && (
            <Empty title="还没有相关帖子" text="新的分享会出现在这里。" />
          )}
        </section>
      )}
      {tab === 'comments' && (
        <section className="admin-table">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  '评论内容',
                  '作者',
                  '帖子',
                  '时间',
                  '积分 / 状态',
                  '操作',
                ].map((t) => (
                  <TableHead key={t}>{t}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.comments?.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell className="comment-cell">{v.content}</TableCell>
                  <TableCell>{v.username}</TableCell>
                  <TableCell>
                    <button
                      className="text-link"
                      onClick={() => go('/post/' + v.post_id)}
                    >
                      {v.title}
                    </button>
                  </TableCell>
                  <TableCell>{date(v.created_at)}</TableCell>
                  <TableCell>
                    {v.points_awarded} /{' '}
                    {v.status === 'published' ? '正常' : '已删除'}
                  </TableCell>
                  <TableCell>
                    {v.status === 'published' && (
                      <button
                        className="text-link danger"
                        onClick={() =>
                          ask(
                            '删除这条评论？',
                            '可选择是否扣回评论的实际奖励积分。',
                            (deduct: boolean) =>
                              api('comments/' + v.id, 'DELETE', { deduct }),
                            true,
                          )
                        }
                      >
                        删除
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      {tab === 'settings' && (
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(() => api('admin/settings', 'PUT', draft));
          }}
        >
          <Hint>
            规则保存后立即生效。关闭待解锁功能只停止新增锁定块，已有内容继续受到保护。
          </Hint>
          {settingsGroups.map(([title, fields]: any) => (
            <section key={title} className="settings-section">
              <h3>{title}</h3>
              {title === '待解锁内容' && (
                <div className="settings-checks">
                  <label className="check-label">
                    <Checkbox
                      checked={draft.locked_enabled}
                      onCheckedChange={(v) =>
                        setDraft({ ...draft, locked_enabled: !!v })
                      }
                    />
                    启用待解锁内容
                  </label>
                  {['article', 'image'].map((k) => (
                    <label key={k} className="check-label">
                      <Checkbox
                        checked={draft.locked_categories.includes(k)}
                        onCheckedChange={(v) =>
                          setDraft({
                            ...draft,
                            locked_categories: v
                              ? [...draft.locked_categories, k]
                              : draft.locked_categories.filter(
                                  (x: string) => x !== k,
                                ),
                          })
                        }
                      />
                      {categories[k].name}允许使用
                    </label>
                  ))}
                </div>
              )}
              <div className="settings-grid">
                {fields.map(([key, label]: any) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      required
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
          <section className="settings-section">
            <h3>封禁账号登录方式</h3>
            <NativeSelect
              value={draft.ban_login_mode}
              onChange={(e) =>
                setDraft({ ...draft, ban_login_mode: e.target.value })
              }
            >
              <option value="reason">允许登录，仅查看封禁原因</option>
              <option value="deny">完全禁止登录</option>
            </NativeSelect>
          </section>
          <button className="primary" disabled={busy}>
            保存全部设置
          </button>
        </form>
      )}
      {tab === 'quiz' && (
        <section className="quiz-editor">
          <Hint>
            正确答案仅管理员可见。保存题目后，尚未完成注册的准入验证会失效，用户需重新答题。新增题目后可在积分与等级设置中调整抽题数量。
          </Hint>
          {questions.map((v: any, i: number) => (
            <div className="quiz-question" key={v.id}>
              <div className="section-bar">
                <h3>题目 {i + 1}</h3>
                <div className="row-actions">
                  <button
                    disabled={!i}
                    aria-label="题目上移"
                    onClick={() => {
                      const n = [...questions];
                      [n[i], n[i - 1]] = [n[i - 1], n[i]];
                      setQuestions(n);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    disabled={i === questions.length - 1}
                    aria-label="题目下移"
                    onClick={() => {
                      const n = [...questions];
                      [n[i], n[i + 1]] = [n[i + 1], n[i]];
                      setQuestions(n);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="danger"
                    aria-label="删除题目"
                    onClick={() =>
                      setQuestions(questions.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="settings-grid">
                <label>
                  题目
                  <input
                    required
                    value={v.question}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, n) =>
                          n === i ? { ...x, question: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  正确答案
                  <input
                    required
                    value={v.correct_answer}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, n) =>
                          n === i
                            ? { ...x, correct_answer: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  分值
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={v.score}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, n) =>
                          n === i ? { ...x, score: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  题型
                  <NativeSelect
                    value={v.type}
                    onChange={(e) =>
                      setQuestions(
                        questions.map((x, n) =>
                          n === i ? { ...x, type: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="text">手动输入回答</option>
                  </NativeSelect>
                </label>
                <label className="check-label">
                  <Checkbox
                    checked={v.status === 'active'}
                    onCheckedChange={(value) =>
                      setQuestions(
                        questions.map((x, n) =>
                          n === i
                            ? { ...x, status: value ? 'active' : 'inactive' }
                            : x,
                        ),
                      )
                    }
                  />
                  启用此题
                </label>
              </div>
            </div>
          ))}
          <div className="row-actions">
            <button
              className="secondary"
              onClick={() =>
                setQuestions([
                  ...questions,
                  {
                    id: crypto.randomUUID(),
                    question: '',
                    correct_answer: '',
                    type: 'text',
                    score: 10,
                    status: 'active',
                  },
                ])
              }
            >
              <Plus size={16} />
              新增题目
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                save(() => api('admin/quiz', 'PUT', { questions }))
              }
            >
              保存题目
            </button>
          </div>
        </section>
      )}
      {tab === 'logs' && (
        <section className="admin-table">
          <Table>
            <TableHeader>
              <TableRow>
                {['时间', '管理员', '操作', '目标', '详情'].map((t) => (
                  <TableHead key={t}>{t}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.logs?.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell>{date(v.created_at)}</TableCell>
                  <TableCell>{v.username}</TableCell>
                  <TableCell>
                    {(
                      {
                        adjust_points: '调整积分',
                        ban_user: '封禁账号',
                        unban_user: '解除封禁',
                        delete_post: '删除帖子',
                        edit_post: '编辑帖子',
                        hide_post: '隐藏帖子',
                        restore_post: '恢复帖子',
                        pin_post: '置顶帖子',
                        unpin_post: '取消置顶',
                        delete_comment: '删除评论',
                        update_settings: '修改设置',
                        update_quiz: '修改题目',
                      } as any
                    )[v.action] || v.action}
                  </TableCell>
                  <TableCell>
                    <small>{v.target_id}</small>
                  </TableCell>
                  <TableCell className="log-detail">{v.detail}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      {!['quiz', 'settings'].includes(tab) && (
        <div className="pagination">
          <button
            disabled={!page}
            onClick={() => setPage(Math.max(0, page - 50))}
          >
            上一页
          </button>
          <span>第 {page / 50 + 1} 页</span>
          <button
            disabled={(data[tab]?.length || 0) < 50}
            onClick={() => setPage(page + 50)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
