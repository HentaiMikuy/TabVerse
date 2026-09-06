import { onBeforeUnmount, onMounted, reactive } from 'vue';
import { WEEKDAYS } from '../utils/common';
import { useSettings } from './useSettings';
import { useI18n } from '../utils/i18n';

const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 秒级时钟：顶栏与简约模式共用，时区跟随 settings.timezone（空 = 系统本地时间），文案随语言 */
export function useClock() {
  const { settings } = useSettings();
  const { t, isZh } = useI18n();
  const clock = reactive({ time: '--:--', sec: '00', date: '--', greeting: '你好' });

  // 按当前时区缓存格式化器，避免每秒重建
  let fmtTz: string | undefined;
  let fmt: Intl.DateTimeFormat | null = null;
  function getFmt(tz: string | undefined) {
    if (!fmt || fmtTz !== tz) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
      });
      fmtTz = tz;
    }
    return fmt;
  }

  function greet(h: number): string {
    if (h < 5) return t('greet.night');
    if (h < 11) return t('greet.morning');
    if (h < 13) return t('greet.noon');
    if (h < 18) return t('greet.afternoon');
    return t('greet.evening');
  }

  function tick() {
    const now = new Date();
    const tz = settings.timezone || undefined;
    try {
      const parts = getFmt(tz).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      const h = Number(get('hour'));
      const m = Number(get('minute'));
      const s = Number(get('second'));
      const month = Number(get('month'));
      const day = Number(get('day'));
      const wdIdx = WD_EN.indexOf(get('weekday'));
      const p = (n: number) => String(n).padStart(2, '0');
      clock.time = `${p(h)}:${p(m)}`;
      clock.sec = p(s);
      clock.date = isZh.value
        ? `${month}月${day}日 星期${WEEKDAYS[wdIdx]}`
        : `${MONTHS_EN[month - 1] || ''} ${day}, ${WD_EN[wdIdx] || ''}`;
      clock.greeting = greet(h);
    } catch {
      // 无效时区等异常：回退系统本地时间
      const p = (n: number) => String(n).padStart(2, '0');
      clock.time = `${p(now.getHours())}:${p(now.getMinutes())}`;
      clock.sec = p(now.getSeconds());
      clock.date = isZh.value
        ? `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`
        : `${MONTHS_EN[now.getMonth()]} ${now.getDate()}, ${WD_EN[now.getDay()]}`;
      clock.greeting = greet(now.getHours());
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    tick();
    timer = setInterval(tick, 1000);
  });
  onBeforeUnmount(() => clearInterval(timer));

  return clock;
}
