/**
 * [INPUT]: 原生可见性与系统减弱动效设置
 * [OUTPUT]: desktopMotion 的出入关键帧与时长，只改变 transform/opacity
 * [POS]: 桌面显示过渡的纯参数；原生层在淡出结束后隐藏窗口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function desktopMotion(visible: boolean, reduced: boolean) {
  const frames: Keyframe[] = reduced ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ transform: 'scale(.94)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
  return { frames: visible ? frames : [...frames].reverse(), duration: reduced ? 120 : 180 }
}
