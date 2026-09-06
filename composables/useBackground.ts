import { ref } from 'vue';
import { K_BG_URL, storeLocalGet, storeLocalSetReport } from './useStorage';

/** 自定义背景地址（URL 或 data URL）。体积可能很大，单独存 chrome.storage.local，不进 sync 设置 */
const bgUrl = ref('');

let loading: Promise<void> | null = null;

export function useBackground() {
  if (!loading) {
    loading = storeLocalGet<string>(K_BG_URL, '').then((u) => {
      bgUrl.value = u;
    });
  }

  /** 保存背景地址，返回是否持久化成功（大文件可能超出配额） */
  async function setBgUrl(url: string): Promise<boolean> {
    bgUrl.value = url;
    return storeLocalSetReport(K_BG_URL, url);
  }

  return { bgUrl, setBgUrl, ready: loading };
}
