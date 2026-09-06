import { onBeforeUnmount, onMounted, reactive } from 'vue';
import { WEEKDAYS } from '../utils/common';

/** 秒级时钟：顶栏与简约模式共用 */
export function useClock() {
  const clock = reactive({ time: '--:--', sec: '00', date: '--', greeting: '你好' });

  function tick() {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    clock.time = `${p(now.getHours())}:${p(now.getMinutes())}`;
    clock.sec = p(now.getSeconds());
    clock.date = `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;
    const h = now.getHours();
    clock.greeting =
      h < 5 ? '夜深了，注意休息 🌃' : h < 11 ? '早上好 ☀️' : h < 13 ? '中午好 🍚' : h < 18 ? '下午好 🌤️' : '晚上好 🌙';
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    tick();
    timer = setInterval(tick, 1000);
  });
  onBeforeUnmount(() => clearInterval(timer));

  return clock;
}
