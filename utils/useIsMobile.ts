import { useEffect, useState } from 'react';

/**
 * 全站唯一的手机 / 电脑断点 (px)。
 * 必须与 Tailwind 的 `md:` 前缀保持一致 —— CSS 与 JS 用同一个数字，
 * 才不会出现「JS 判定为手机、CSS 却已经切换成电脑版」的错位。
 *
 * The single source of truth for the mobile / desktop breakpoint.
 * Keep this in sync with Tailwind's `md:` prefix so CSS and JS always agree.
 */
export const MOBILE_BREAKPOINT = 768;

const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const matchesMobile = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches;

/**
 * 返回当前是否为手机布局（视口宽度 < 768px）。
 * 使用 matchMedia 订阅，只在断点真正跨越时才重渲染，比监听 resize 更省性能。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(matchesMobile);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}
