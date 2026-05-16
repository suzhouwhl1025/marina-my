/**
 * @file src/renderer/components/TerminalToolbar.tsx
 * @purpose BETA-028 终端工具栏:Tab bar 右端的快捷动作。
 *
 *   按钮:
 *   - 简易页面切换(Minimize2/Maximize2)— BETA-027
 *
 *   2026-05-16 beta 反馈精简:复制全部 / 清屏 / 搜索 三个按钮暂时移除
 *   (实际使用率低,UI 上喧宾夺主)。Ctrl+F 搜索快捷键 / 右键菜单复制等
 *   走原有入口,不受影响。
 *
 * @对应文档章节: 软件定义书 6.x 增强;工单库 BETA-027 / BETA-028
 */
import { Maximize2, Minimize2 } from 'lucide-react';
import { useAppDispatch, useAppState } from '../store';
import { useTranslation } from './LanguageProvider';

interface TerminalToolbarProps {
  /**
   * 'inline' = 嵌入在 tab-bar 右端;'floating' = 简易模式下浮在窗口右上角。
   * 影响外层 class 与定位策略。
   */
  variant: 'inline' | 'floating';
}

export function TerminalToolbar({ variant }: TerminalToolbarProps): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const simpleMode = state.simpleMode;

  const handleToggleSimple = (): void => {
    dispatch({ type: 'view/toggle-simple-mode' });
  };

  return (
    <div className={`terminal-toolbar terminal-toolbar-${variant}`}>
      <button
        type="button"
        className="terminal-toolbar-btn"
        onClick={handleToggleSimple}
        title={simpleMode ? t('terminal.toolbar.fromSimple') : t('terminal.toolbar.toSimple')}
        aria-label={simpleMode ? t('terminal.toolbar.fromSimple') : t('terminal.toolbar.toSimple')}
      >
        {simpleMode ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
      </button>
    </div>
  );
}
