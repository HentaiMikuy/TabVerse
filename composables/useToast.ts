import { reactive } from 'vue';

const toastState = reactive({ visible: false, message: '' });
let timer: ReturnType<typeof setTimeout> | undefined;

export function useToast() {
  function toast(message: string, duration = 2600) {
    toastState.message = message;
    toastState.visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      toastState.visible = false;
    }, duration);
  }
  return { toastState, toast };
}
