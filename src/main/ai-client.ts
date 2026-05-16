/**
 * @file src/main/ai-client.ts
 * @purpose BETA-031:AI 助手主进程客户端。统一封装 Anthropic / OpenAI 两套
 *   SDK,提供 testConnection 与 recheckIdle 两个方法。
 *
 *   API key 来自 settings.ai.apiKey,运行时变更通过 setSettings() 同步。
 *   失败回退 throw,调用方决定后续行为(BETA-006 LLM 复核失败回退到原阈值,
 *   不阻塞主流程)。
 *
 *   为什么用官方 SDK 而不是 fetch:与 BETA-031 实施决策一致(用户拍板:
 *   维护成本低、类型完整)。同时 BETA-031 是 Marina 第一个 LLM 集成点,
 *   未来还可能扩展 streaming / function calling,SDK 提供更平坦的升级路径。
 *
 * @对应文档章节: 工单库 BETA-006 BETA-031;软件定义书后续 AI 章节
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Settings } from '@shared/types';
import { logger } from './logger';

const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

/**
 * 取 settings 中的 ai 配置;未设置时返回安全默认(provider null)。
 * SettingsManager 在 initialize 完成前调用本类是合理的(测试 / 早期 IPC)。
 */
function safeAi(s: Settings | undefined): {
  provider: 'anthropic' | 'openai' | null;
  apiKey: string;
  /** F6(beta 勘误2):自定义 endpoint;空串 = SDK 默认 */
  baseURL: string;
  model: string;
} {
  const ai = s?.ai;
  return {
    provider: ai?.provider ?? null,
    apiKey: ai?.apiKey ?? '',
    baseURL: ai?.baseURL ?? '',
    model: ai?.model ?? '',
  };
}

/**
 * F6(beta 勘误2):Anthropic / OpenAI 两个 SDK 都接 `baseURL?: string` 字段。
 * 空串视为未填,不传(让 SDK 走默认 endpoint);非空时透传(无 trailing
 * slash 处理 — SDK 内部已兼容)。返回值直接展开到 SDK constructor 的
 * options 上。
 */
function clientOptions(apiKey: string, baseURL: string): { apiKey: string; baseURL?: string } {
  return baseURL.trim()
    ? { apiKey, baseURL: baseURL.trim() }
    : { apiKey };
}

export interface TestConnectionResult {
  ok: boolean;
  /** 成功时:provider 显示名;失败时:错误描述 */
  message: string;
}

export class AIClient {
  /**
   * @param getSettings 注入 settings 读取函数 — SettingsManager.get() 直接传过来。
   *   每次调用现读,避免 settings 改了客户端不刷新的问题。
   */
  constructor(private readonly getSettings: () => Settings | undefined) {}

  /** 当前是否可用(已选 provider + 已填 key) */
  isConfigured(): boolean {
    const { provider, apiKey } = safeAi(this.getSettings());
    return !!provider && apiKey.trim().length > 0;
  }

  /**
   * 跑一次最小请求验证 key 有效。
   * 错误细节走 message 字段返回,不抛 — 调用方(IPC handler)直接转给 UI。
   */
  async testConnection(): Promise<TestConnectionResult> {
    const { provider, apiKey, baseURL, model } = safeAi(this.getSettings());
    if (!provider) return { ok: false, message: '未选择 provider' };
    if (!apiKey.trim()) return { ok: false, message: 'API key 为空' };
    try {
      if (provider === 'anthropic') {
        const client = new Anthropic(clientOptions(apiKey, baseURL));
        const res = await client.messages.create({
          model: model || DEFAULT_ANTHROPIC_MODEL,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ping' }],
        });
        return {
          ok: true,
          message: `Anthropic ${res.model} 响应 OK`,
        };
      }
      // openai
      const client = new OpenAI(clientOptions(apiKey, baseURL));
      const res = await client.chat.completions.create({
        model: model || DEFAULT_OPENAI_MODEL,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return { ok: true, message: `OpenAI ${res.model} 响应 OK` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('AIClient', 'testConnection failed', err);
      return { ok: false, message: msg };
    }
  }

  /**
   * BETA-006:在 active→idle 跃迁前给 LLM 看一眼 scrollback 尾部,问它
   * "这个进程是真的在等命令(idle),还是只是没输出而已(应保持 active)"。
   *
   * 返回 'keep-active' = LLM 判定进程仍在跑;'go-idle' = 应转 idle;
   * 出错时 throw — 调用方应当 try/catch 并回退到原阈值判定。
   */
  async recheckIdle(scrollbackTail: string): Promise<'keep-active' | 'go-idle'> {
    const { provider, apiKey, baseURL, model } = safeAi(this.getSettings());
    if (!provider) throw new Error('AI provider 未配置');
    if (!apiKey.trim()) throw new Error('AI apiKey 未填');

    const prompt =
      'You are reading the last bytes of a running terminal session ' +
      'to determine whether the foreground process is still actively working or ' +
      'has finished and returned to the prompt.\n\n' +
      'Reply with EXACTLY one word: "active" if it is still running (e.g. a dev ' +
      'server like Vite watching files, a long compile, a TUI), or "idle" if it ' +
      'has returned to a shell prompt waiting for the next command.\n\n' +
      '--- terminal tail ---\n' +
      scrollbackTail +
      '\n--- end ---\n';

    let text: string;
    if (provider === 'anthropic') {
      const client = new Anthropic(clientOptions(apiKey, baseURL));
      const res = await client.messages.create({
        model: model || DEFAULT_ANTHROPIC_MODEL,
        max_tokens: 8,
        messages: [{ role: 'user', content: prompt }],
      });
      // Anthropic content 是 array of blocks;取首个 text block
      const block = res.content[0];
      text = block && block.type === 'text' ? block.text : '';
    } else {
      const client = new OpenAI(clientOptions(apiKey, baseURL));
      const res = await client.chat.completions.create({
        model: model || DEFAULT_OPENAI_MODEL,
        max_tokens: 8,
        messages: [{ role: 'user', content: prompt }],
      });
      text = res.choices[0]?.message?.content ?? '';
    }
    const normalized = text.trim().toLowerCase();
    if (normalized.includes('active')) return 'keep-active';
    return 'go-idle';
  }
}
