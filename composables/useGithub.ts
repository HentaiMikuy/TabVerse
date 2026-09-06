import { onUnmounted, reactive, readonly, ref, watch, type Ref } from 'vue';
import { HEAT_RANGE_DAYS, type HeatRange } from '../utils/common';
import { useI18n } from '../utils/i18n';
import {
  K_GH_PROFILE,
  K_GH_RATE_LIMIT,
  K_GH_REPOS,
  K_GH_SEARCH_RATE_LIMIT,
  K_GH_TOKEN,
  storeGet,
  storeLocalGet,
  storeLocalRemove,
  storeLocalSet,
  storeRemove,
  storeSet,
} from './useStorage';

/* ---------------- GitHub 限流识别与缓存 ---------------- */

const CACHE_TTL = 30 * 60 * 1000; // 缓存 30 分钟，避免每次打开新标签页都消耗 API 配额；需要最新数据可用面板内手动刷新按钮强制更新

/** GitHub 未认证配额耗尽时返回 403 且 X-RateLimit-Remaining 为 0 */
function isRateLimitedResponse(response: Response): boolean {
  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

/** 限流重置时间（秒 → 毫秒），无该头则返回 0 */
function rateLimitResetAt(response: Response): number {
  const reset = Number(response.headers.get('x-ratelimit-reset')) || 0;
  return reset > 0 ? reset * 1000 : 0;
}

function retryDelayMs(resetAtMs: number): number {
  return Math.min(Math.max(resetAtMs - Date.now() + 1000, 1000), 60 * 60 * 1000);
}

/* ---------------- 限流状态持久化：限流窗口内新开标签页直接提示倒计时，不再发无效请求 ---------------- */

interface RateLimitMarker {
  resetAt: number; // 限流重置时间（ms 时间戳）
}

/** 读取持久化的限流重置时间；窗口已过视为未限流（返回 0），下次成功后会被清除 */
async function persistedRateLimitResetAt(key: string): Promise<number> {
  const marker = await storeGet<RateLimitMarker | null>(key, null);
  if (!marker || marker.resetAt <= Date.now()) return 0;
  return marker.resetAt;
}

function rateLimitMessage(resetAt: number, label: string): string {
  const { t } = useI18n();
  return t('gh.err.rateRetry', { label, n: Math.ceil(retryDelayMs(resetAt) / 1000) });
}

/* ---------------- GitHub OAuth（Device Flow）登录：未登录 60 次/时 → 登录后 5000 次/时 ---------------- */

const ghToken = ref('');
const ghLoginState = reactive({
  status: 'idle' as 'idle' | 'waiting' | 'success' | 'error',
  userCode: '', // 授权码
  verificationUri: '', // 浏览器验证地址
  errorMsg: '',
});

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let tokenLoaded: Promise<void> | null = null;

function stopGithubLogin() {
  if (pollingTimer !== null) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

async function loadGithubToken(): Promise<void> {
  ghToken.value = (await storeLocalGet<string>(K_GH_TOKEN, '')) || '';
}

/** 请求前确保令牌已从存储读入（并发请求共享一次读取） */
function ensureGithubToken(): Promise<void> {
  if (!tokenLoaded) tokenLoaded = loadGithubToken();
  return tokenLoaded;
}

function authHeaders(base: Record<string, string>): Record<string, string> {
  return ghToken.value ? { ...base, Authorization: `Bearer ${ghToken.value}` } : base;
}

async function startGithubLogin(clientId: string) {
  const { t } = useI18n();
  stopGithubLogin();
  ghLoginState.status = 'idle';
  ghLoginState.userCode = '';
  ghLoginState.verificationUri = '';
  ghLoginState.errorMsg = '';
  const cid = clientId.trim();
  if (!cid) {
    ghLoginState.status = 'error';
    ghLoginState.errorMsg = t('gh.err.needClientId');
    return;
  }
  try {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: cid, scope: '' }),
    });
    const data = (await res.json()) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      expires_in?: number;
      interval?: number;
      error?: string;
    };
    if (!data.device_code || !data.user_code) {
      throw new Error(data.error === 'incorrect_client_credentials' ? t('gh.err.badClientId') : t('gh.err.noDeviceCode'));
    }
    ghLoginState.status = 'waiting';
    ghLoginState.userCode = data.user_code;
    ghLoginState.verificationUri = data.verification_uri || 'https://github.com/login/device';
    const expireAt = Date.now() + (data.expires_in || 900) * 1000;
    const intervalMs = Math.max(data.interval || 5, 5) * 1000;

    pollingTimer = setInterval(async () => {
      try {
        const tr = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: cid,
            device_code: data.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });
        const td = (await tr.json()) as { access_token?: string; error?: string };
        if (td.access_token) {
          stopGithubLogin();
          ghToken.value = td.access_token;
          ghLoginState.status = 'success';
          void storeLocalSet(K_GH_TOKEN, td.access_token);
          // 登录后配额提升，清除未登录时持久化的限流标记，避免仍按旧窗口拦截请求
          void storeRemove(K_GH_RATE_LIMIT);
          void storeRemove(K_GH_SEARCH_RATE_LIMIT);
        } else if (td.error === 'authorization_pending' || td.error === 'slow_down') {
          /* 继续轮询 */
        } else {
          stopGithubLogin();
          ghLoginState.status = 'error';
          ghLoginState.errorMsg =
            td.error === 'access_denied' ? t('gh.err.denied') : t('gh.err.authFailed', { err: td.error || 'unknown' });
        }
      } catch {
        /* 网络波动：下一轮继续 */
      }
      if (pollingTimer && Date.now() > expireAt) {
        stopGithubLogin();
        ghLoginState.status = 'error';
        ghLoginState.errorMsg = t('gh.err.expired');
      }
    }, intervalMs);
  } catch (err) {
    ghLoginState.status = 'error';
    ghLoginState.errorMsg = err instanceof Error ? err.message : t('gh.err.startFailed');
  }
}

function cancelGithubLogin() {
  stopGithubLogin();
  ghLoginState.status = 'idle';
  ghLoginState.userCode = '';
  ghLoginState.verificationUri = '';
  ghLoginState.errorMsg = '';
}

async function logoutGithub() {
  cancelGithubLogin();
  ghToken.value = '';
  await storeLocalRemove(K_GH_TOKEN);
  // 退出登录后回到未认证配额，旧限流标记才可能有效
  void storeRemove(K_GH_RATE_LIMIT);
  void storeRemove(K_GH_SEARCH_RATE_LIMIT);
}

/** 带超时的 fetch：超时或外部信号中止时以 AbortError 拒绝，避免请求挂起导致界面一直 loading */
function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const external = init?.signal;
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/* ---------------- GitHub Trending / 新星仓库（公开 Search API，无需登录） ---------------- */

export type GithubPeriod = 'daily' | 'weekly' | 'monthly';
export type GithubSort = 'popular' | 'new';

export interface TrendingRepo {
  id: number;
  name: string; // owner/repo
  description: string;
  language: string;
  stars: number;
  forks: number;
  url: string;
  accent: string;
}

const PERIOD_DAYS: Record<GithubPeriod, number> = { daily: 1, weekly: 7, monthly: 30 };

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', Ruby: '#cc342d', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', PHP: '#4F5D95',
  Lua: '#8b5cf6', Zig: '#f59e0b', Shell: '#89e051', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c', SCSS: '#c6538c', MDX: '#fcb32c', Markdown: '#64748b', Dockerfile: '#384d54',
  'Jupyter Notebook': '#DA5B0B', Svelte: '#ff3e00', Elixir: '#6e4a7e', Haskell: '#5e5086',
  Clojure: '#db5855', Scala: '#c22d40', R: '#198CE7', TeX: '#3D6117',
  'Objective-C': '#438eff', Assembly: '#6E4C13', Perl: '#0298c3', Julia: '#a270ba',
  Nim: '#ffc200', OCaml: '#3be133', Crystal: '#000100', Erlang: '#B83998',
  Groovy: '#4298b8', CoffeeScript: '#244776', 'F#': '#b845fc', D: '#ba595e',
  Haxe: '#df7900', Vala: '#a56de2', PureScript: '#1D222D', Elm: '#60B5CC',
  Reason: '#ff5847', Solidity: '#AA6746', SQL: '#e38c00', PowerShell: '#012456',
  Makefile: '#427819', CMake: '#DA3434', 'Emacs Lisp': '#c065db', 'Vim Script': '#199f4b',
  MATLAB: '#e16737', Nix: '#7e7eff', HCL: '#844FBA', YAML: '#cb171e', TOML: '#9c4221',
  JSON: '#292929', GraphQL: '#e10098', Roff: '#ecdebe', Batchfile: '#C1F12E',
  GLS: '#5686a5', HLSL: '#aace60', WebAssembly: '#04133b',
};

export const GITHUB_LANGUAGES = [
  'all', 'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust', 'Ruby',
  'C++', 'C', 'C#', 'Swift', 'Kotlin', 'Dart', 'PHP', 'Vue', 'HTML', 'CSS', 'Shell',
  'Lua', 'Zig', 'Svelte', 'Elixir', 'Haskell', 'Clojure', 'Scala', 'R',
  'Objective-C', 'Assembly', 'Julia', 'Nim', 'OCaml',
];

function languageColor(language: string | null): string {
  if (!language) return '#6b7280';
  return LANGUAGE_COLORS[language] || '#6b7280';
}

function languageSlug(language: string): string {
  return encodeURIComponent(language.toLowerCase().replaceAll(' ', '-'));
}

export function githubTrendingPageUrl(language: string, period: GithubPeriod): string {
  const langPath = language && language !== 'all' ? `/${languageSlug(language)}` : '';
  return `https://github.com/trending${langPath}?since=${period}`;
}

function newRepositoryQuery(language: string, period: GithubPeriod, sort: GithubSort): string {
  const langQuery = language && language !== 'all' ? ` language:"${language}"` : '';
  if (sort === 'popular') {
    // 历史热门：按 Star 排序 + 最低 Star 阈值
    return `stars:>1000 archived:false${langQuery}`;
  }
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - PERIOD_DAYS[period]);
  const dateStr = start.toISOString().split('T')[0];
  return `created:>${dateStr} archived:false${langQuery}`;
}

function newRepositoriesApiUrl(language: string, period: GithubPeriod, sort: GithubSort): string {
  const params = new URLSearchParams({
    q: newRepositoryQuery(language, period, sort),
    sort: 'stars',
    order: 'desc',
    per_page: '30',
  });
  return `https://api.github.com/search/repositories?${params}`;
}

interface SearchRepoItem {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  html_url: string;
}

function mapRepo(item: SearchRepoItem): TrendingRepo {
  return {
    id: item.id,
    name: item.full_name,
    description: item.description || '',
    language: item.language || 'Unknown',
    stars: item.stargazers_count,
    forks: item.forks_count,
    url: item.html_url,
    accent: languageColor(item.language),
  };
}

export function useGithubRepos(language: Ref<string>, period: Ref<GithubPeriod>, sort: Ref<GithubSort>) {
  const repos = ref<TrendingRepo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let requestVersion = 0;

  interface ReposCache {
    key: string;
    fetchedAt: number;
    repos: TrendingRepo[];
  }

  async function refresh(force = false) {
    const { t } = useI18n();
    await ensureGithubToken();
    requestVersion++;
    const version = requestVersion;
    controller?.abort();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    const cacheKey = `${language.value}|${period.value}|${sort.value}`;

    // 命中缓存：直接展示，不再消耗 search 配额（10 次/分钟）
    if (!force) {
      const cached = await storeGet<ReposCache | null>(K_GH_REPOS, null);
      if (cached && cached.key === cacheKey && Date.now() - cached.fetchedAt < CACHE_TTL) {
        repos.value = cached.repos;
        loading.value = false;
        error.value = null;
        return;
      }
    }

    // 限流窗口内：直接提示并挂自动重试，不再发无效请求（重试按钮 force=true 可绕过）
    if (!force) {
      const resetAt = await persistedRateLimitResetAt(K_GH_SEARCH_RATE_LIMIT);
      if (resetAt > 0) {
        loading.value = false;
        error.value = rateLimitMessage(resetAt, t('gh.err.rateLimitSearch'));
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void refresh(true);
        }, retryDelayMs(resetAt));
        return;
      }
    }

    const ctrl = new AbortController();
    controller = ctrl;
    loading.value = true;
    error.value = null;

    try {
      const response = await fetchWithTimeout(newRepositoriesApiUrl(language.value, period.value, sort.value), 10_000, {
        signal: ctrl.signal,
        headers: authHeaders({ Accept: 'application/vnd.github+json' }),
      });
      if (ctrl.signal.aborted || version !== requestVersion) return;
      if (!response.ok) {
        if (isRateLimitedResponse(response)) {
          const resetAt = rateLimitResetAt(response);
          if (resetAt > 0) {
            void storeSet(K_GH_SEARCH_RATE_LIMIT, { resetAt });
            error.value = rateLimitMessage(resetAt, t('gh.err.rateLimitSearch'));
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void refresh(true);
            }, retryDelayMs(resetAt));
          } else {
            error.value = t('gh.err.searchLimited');
          }
        } else {
          throw new Error(t('gh.err.searchFailed', { n: response.status }));
        }
        return;
      }
      const payload: { items?: SearchRepoItem[] } = await response.json().catch(() => ({}));
      if (!Array.isArray(payload.items)) throw new Error(t('gh.err.badData'));
      repos.value = payload.items.map(mapRepo);
      void storeSet(K_GH_REPOS, { key: cacheKey, fetchedAt: Date.now(), repos: repos.value });
      void storeRemove(K_GH_SEARCH_RATE_LIMIT);
    } catch (err) {
      if (ctrl.signal.aborted || version !== requestVersion) return;
      // 内部超时中止（AbortError 但外部 signal 未中止）
      error.value =
        err instanceof DOMException && err.name === 'AbortError'
          ? t('gh.err.timeout')
          : err instanceof Error
            ? err.message
            : t('gh.err.loadRepos');
    } finally {
      if (version === requestVersion && !ctrl.signal.aborted) {
        loading.value = false;
        if (controller === ctrl) controller = null;
      }
    }
  }

  watch([language, period, sort], () => void refresh());
  onUnmounted(() => {
    controller?.abort();
    if (retryTimer !== null) clearTimeout(retryTimer);
  });
  void refresh();

  return { repos: readonly(repos), loading: readonly(loading), error: readonly(error), refresh };
}

/* ---------------- GitHub 公开资料 / 最近动态（公开 REST API，无需登录） ---------------- */

export interface GithubUser {
  login: string;
  name: string;
  bio: string;
  avatarUrl: string;
  profileUrl: string;
  followers: number;
  following: number;
  publicRepos: number;
  company: string;
  location: string;
}

export interface GithubActivity {
  id: string;
  action: string;
  subject: string;
  url: string;
  createdAt: string;
}

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
  level: number; // GitHub 0-4
}

export interface GithubContributions {
  days: ContributionDay[];
  total: number; // 过去一年（与热力图显示范围一致）
}

const CONTRIB_OFFICIAL_URL = (login: string) => `https://github.com/users/${encodeURIComponent(login)}/contributions`;
// 兜底：第三方聚合服务，返回 { total, contributions: [{date,count,level}] }
const CONTRIB_API_URL = (login: string) => `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(login)}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 兼容英文（"3 contributions on ..."）与中文（"3 次贡献" / "3次贡献"）两种 GitHub 界面文案
const CONTRIB_COUNT_RE = /([\d,]+)\s*(?:contributions?|次贡献)/i;

function contributionCountFromText(text: string | null): number {
  if (!text) return 0;
  const m = text.match(CONTRIB_COUNT_RE);
  return m ? Number(m[1].replaceAll(',', '')) : 0;
}

/** 抓取用户贡献数据。官方端点仅覆盖约滚动一年，长范围（两年/全部）需要全历史，故按范围切换数据源顺序 */
async function fetchContributions(login: string, range: HeatRange): Promise<GithubContributions | null> {
  if (HEAT_RANGE_DAYS[range] <= 400) {
    // 半年 / 一年：官方优先，第三方兜底
    return (await fetchOfficialContributions(login)) ?? fetchApiContributions(login);
  }
  // 两年 / 全部：第三方一次返回全历史；失败降级为官方滚动一年（不足则按实际数据渲染）
  return (await fetchApiContributions(login)) ?? fetchOfficialContributions(login);
}

/** 官方端点：贡献日历 HTML 片段（约滚动一年） */
async function fetchOfficialContributions(login: string): Promise<GithubContributions | null> {
  try {
    const res = await fetchWithTimeout(CONTRIB_OFFICIAL_URL(login), 8_000, {
      headers: {
        Accept: 'text/html, */*',
        Referer: `https://github.com/${encodeURIComponent(login)}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const cells = Array.from(doc.querySelectorAll('[data-date][data-level]'));
      if (cells.length) {
        // 第一遍：收集日期 / 等级 / 单元格 id
        const rawDays = cells
          .map((cell) => ({
            date: cell.getAttribute('data-date') || '',
            level: Number(cell.getAttribute('data-level')) || 0,
            id: cell.getAttribute('id') || '',
          }))
          .filter((d) => DATE_RE.test(d.date));
        if (rawDays.length) {
          // 第二遍：遍历独立 <tool-tip for="...">，按 id 关联精确次数
          const countsById = new Map<string, number>();
          for (const tip of Array.from(doc.querySelectorAll('tool-tip[for]'))) {
            const count = contributionCountFromText(tip.textContent);
            if (count > 0) countsById.set(tip.getAttribute('for') || '', count);
          }
          const days = rawDays.map((d) => ({
            date: d.date,
            count: d.id ? (countsById.get(d.id) || 0) : 0,
            level: d.level,
          }));
          // 存在 level≥1 却拿不到次数的天 = 标记变化导致解析不完整，整份弃用
          const incomplete = days.some((d) => d.level > 0 && d.count === 0);
          if (!incomplete) {
            // 总数从标题提取数字（中英文界面均适用），失败则回退为每日求和
            const h2 = doc.querySelector('h2');
            const h2Total = h2
              ? Number((h2.textContent || '').match(/[\d,]+/)?.[0]?.replaceAll(',', '') || 0)
              : 0;
            const total = h2Total || days.reduce((sum, d) => sum + d.count, 0);
            return { days, total };
          }
        }
      }
    }
  } catch {
    /* 返回 null 交由上层回退 */
  }
  return null;
}

/** 第三方聚合 API：一次返回全历史（{date,count,level} 数组） */
async function fetchApiContributions(login: string): Promise<GithubContributions | null> {
  try {
    const res = await fetchWithTimeout(CONTRIB_API_URL(login), 8_000);
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        contributions?: { date?: string; count?: number; level?: number }[];
      } | null;
      const list = Array.isArray(data?.contributions) ? data.contributions : [];
      if (list.length) {
        const days: ContributionDay[] = list
          .filter((d) => d && typeof d.date === 'string' && DATE_RE.test(d.date))
          .map((d) => ({
            date: d.date as string,
            count: Number(d.count) || 0,
            level: Math.min(4, Math.max(0, Number(d.level) || 0)),
          }));
        const since = new Date();
        since.setDate(since.getDate() - 364);
        const sinceStr = since.toISOString().split('T')[0];
        const total = days.filter((d) => d.date >= sinceStr).reduce((sum, d) => sum + d.count, 0);
        if (days.length) return { days, total };
      }
    }
  } catch {
    /* 忽略 */
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function activityTypeKey(type: string): string {
  const keys: Record<string, string> = {
    PushEvent: 'push', PullRequestEvent: 'pr', IssuesEvent: 'issue',
    IssueCommentEvent: 'comment', WatchEvent: 'watch', ForkEvent: 'fork',
    CreateEvent: 'create', ReleaseEvent: 'release', DeleteEvent: 'delete',
    PublicEvent: 'public', GollumEvent: 'wiki',
  };
  return keys[type] || 'other';
}

function mapActivity(event: {
  id: string;
  type: string;
  repo?: { name?: string };
  payload?: Record<string, unknown>;
  created_at: string;
}): GithubActivity {
  const { t } = useI18n();
  const payload = event.payload || {};
  const repoName = event.repo?.name || 'GitHub';
  const repoUrl = `https://github.com/${repoName}`;
  const typeKey = activityTypeKey(event.type);
  let action = t('gh.act.base', { repo: repoName, label: t('gh.act.type.' + typeKey) });
  let subject = repoName;
  let url = repoUrl;

  if (event.type === 'PushEvent') {
    const commits = Array.isArray(payload.commits) ? payload.commits : [];
    const count = asNumber(payload.size) || commits.length;
    const first = (commits[0] as Record<string, unknown> | undefined) || {};
    const branch = asString(payload.ref).replace('refs/heads/', '');
    action = t('gh.act.push', { n: count || 1, repo: repoName });
    subject = asString(first.message) || branch || repoName;
    url = `${repoUrl}/commits`;
  } else if (event.type === 'PullRequestEvent') {
    const pr = (payload.pull_request as Record<string, unknown> | undefined) || {};
    action = t('gh.act.pr', { repo: repoName });
    subject = asString(pr.title) || repoName;
    url = asString(pr.html_url) || repoUrl;
  } else if (event.type === 'IssuesEvent') {
    const issue = (payload.issue as Record<string, unknown> | undefined) || {};
    action = t('gh.act.issue', { repo: repoName });
    subject = asString(issue.title) || repoName;
    url = asString(issue.html_url) || repoUrl;
  } else if (event.type === 'IssueCommentEvent') {
    const comment = (payload.comment as Record<string, unknown> | undefined) || {};
    action = t('gh.act.comment', { repo: repoName });
    subject = asString(comment.body)?.slice(0, 60) || repoName;
    url = asString(comment.html_url) || repoUrl;
  } else if (event.type === 'WatchEvent') {
    action = t('gh.act.star', { repo: repoName });
  } else if (event.type === 'ForkEvent') {
    action = t('gh.act.fork', { repo: repoName });
  } else if (event.type === 'CreateEvent') {
    const refType = asString(payload.ref_type);
    const ref = asString(payload.ref);
    action = t('gh.act.create', { repo: repoName, type: refType || t('gh.act.type.create') });
    subject = ref || repoName;
  } else if (event.type === 'ReleaseEvent') {
    const release = (payload.release as Record<string, unknown> | undefined) || {};
    action = t('gh.act.release', { repo: repoName });
    subject = asString(release.name) || asString(release.tag_name) || repoName;
    url = asString(release.html_url) || repoUrl;
  }

  return { id: event.id, action, subject, url, createdAt: event.created_at };
}

export function useGithubProfile(username: Ref<string | null>, range: Ref<HeatRange>) {
  const user = ref<GithubUser | null>(null);
  const activities = ref<GithubActivity[]>([]);
  const contributions = ref<GithubContributions | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let requestVersion = 0;

  interface ProfileCache {
    login: string;
    fetchedAt: number;
    user: GithubUser | null;
    activities: GithubActivity[];
    contributions: GithubContributions | null;
  }

  function clearRetryTimer() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  async function refresh(force = false) {
    const { t } = useI18n();
    await ensureGithubToken();
    const login = (username.value || '').trim();
    if (!login) return;
    requestVersion++;
    const version = requestVersion;
    controller?.abort();
    clearRetryTimer();

    // 命中缓存：直接展示，不再消耗 core 配额（60 次/小时）
    if (!force) {
      const cached = await storeGet<ProfileCache | null>(K_GH_PROFILE, null);
      if (cached && cached.login === login && Date.now() - cached.fetchedAt < CACHE_TTL) {
        user.value = cached.user;
        activities.value = cached.activities;
        contributions.value = cached.contributions;
        loading.value = false;
        error.value = null;
        return;
      }
    }

    // 限流窗口内：直接提示并挂自动重试，不再发无效请求（重试按钮 force=true 可绕过）
    if (!force) {
      const resetAt = await persistedRateLimitResetAt(K_GH_RATE_LIMIT);
      if (resetAt > 0) {
        loading.value = false;
        error.value = rateLimitMessage(resetAt, t('gh.err.rateLimitCore'));
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void refresh(true);
        }, retryDelayMs(resetAt));
        return;
      }
    }

    const ctrl = new AbortController();
    controller = ctrl;
    loading.value = true;
    error.value = null;

    const headers = authHeaders({ Accept: 'application/vnd.github+json' });
    // 资料与动态是 loading 的关键路径：各自带 15s 超时，保证一定能结算、不会卡死
    const [profileResult, eventResult] = await Promise.allSettled([
      fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(login)}`, 15_000, {
        signal: ctrl.signal,
        headers,
      }),
      fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=10`, 15_000, {
        signal: ctrl.signal,
        headers,
      }),
    ]);

    if (ctrl.signal.aborted || version !== requestVersion) return;

    if (profileResult.status === 'fulfilled') {
      const response = profileResult.value;
      if (response.ok) {
        const data = await response.json().catch(() => null);
        user.value = data
          ? {
              login: asString(data.login),
              name: asString(data.name) || asString(data.login),
              bio: asString(data.bio),
              avatarUrl: asString(data.avatar_url),
              profileUrl: asString(data.html_url) || `https://github.com/${login}`,
              followers: asNumber(data.followers),
              following: asNumber(data.following),
              publicRepos: asNumber(data.public_repos),
              company: asString(data.company),
              location: asString(data.location),
            }
          : null;
      } else if (isRateLimitedResponse(response)) {
        // 未认证配额耗尽（403 + X-RateLimit-Remaining: 0）：持久化重置时间，
        // 新开标签页在窗口内直接提示倒计时；提示并在重置后自动重试
        const resetAt = rateLimitResetAt(response);
        if (resetAt > 0) {
          void storeSet(K_GH_RATE_LIMIT, { resetAt });
          error.value = rateLimitMessage(resetAt, t('gh.err.rateLimitCore'));
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void refresh(true);
          }, retryDelayMs(resetAt));
        } else {
          error.value = t('gh.err.limitedManual');
        }
        user.value = null;
      } else {
        error.value = response.status === 404 ? t('gh.err.userNotFound', { login }) : t('gh.err.profileFailed', { n: response.status });
        user.value = null;
      }
    } else {
      const reason = profileResult.reason;
      error.value =
        reason instanceof DOMException && reason.name === 'AbortError'
          ? t('gh.err.netTimeout')
          : t('gh.err.noNetwork');
    }

    if (eventResult.status === 'fulfilled' && eventResult.value.ok) {
      const events = await eventResult.value.json().catch(() => []);
      if (Array.isArray(events)) {
        activities.value = events.slice(0, 10).map(mapActivity);
      }
    } else if (!error.value) {
      error.value = t('gh.err.noActivity');
    }

    loading.value = false;
    if (controller === ctrl) controller = null;

    // 贡献数据独立异步获取（自带 8s 超时）：不参与 loading，热力图就绪后自然出现
    const contrib = await fetchContributions(login, range.value).catch(() => null);
    if (ctrl.signal.aborted || version !== requestVersion) return;
    contributions.value = contrib;

    // 资料获取成功才写缓存（404/限流/网络错误不缓存），并清除限流标记
    if (profileResult.status === 'fulfilled' && profileResult.value.ok) {
      void storeSet(K_GH_PROFILE, {
        login,
        fetchedAt: Date.now(),
        user: user.value,
        activities: activities.value,
        contributions: contrib,
      });
      void storeRemove(K_GH_RATE_LIMIT);
    }
  }

  watch([username, range], () => void refresh(), { immediate: true });
  onUnmounted(() => {
    controller?.abort();
    clearRetryTimer();
  });

  function reset() {
    requestVersion++;
    controller?.abort();
    clearRetryTimer();
    controller = null;
    user.value = null;
    activities.value = [];
    contributions.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    user: readonly(user),
    activities: readonly(activities),
    contributions: readonly(contributions),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    reset,
    ghToken: readonly(ghToken),
    ghLogin: ghLoginState,
    startGithubLogin,
    cancelGithubLogin,
    logoutGithub,
  };
}