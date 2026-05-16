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
   * BETA-006 v2:active→idle 跃迁前给 LLM 看一眼终端尾部,问它"用户该不
   * 该回来看一眼了" — 因为 Marina 的主要用途是监控多个后台 Agent,旧 tab
   * 在后台跑、状态点是用户判断"该不该回去检查"的唯一信号。
   *
   * 返回 'keep-active' = 任务还在跑,先别打扰用户;'go-idle' = 任务停了 /
   * 出错 / 在等人输入,该让状态点亮起来。
   *
   * 出错时 throw — 调用方应当 try/catch 并回退到原阈值判定。
   */
  async recheckIdle(scrollbackTail: string): Promise<'keep-active' | 'go-idle'> {
    const { provider, apiKey, baseURL, model } = safeAi(this.getSettings());
    if (!provider) throw new Error('AI provider 未配置');
    if (!apiKey.trim()) throw new Error('AI apiKey 未填');

    // Prompt 语义:不是"还在跑 vs 返回 shell",而是"需要人为检查 vs 让它继续
    // 跑"。覆盖 sleep / 阻塞 IO / TUI 等无输出但在跑的情况(否则会被误判
    // idle),也覆盖错误 + 新 prompt、y/n 询问、密码 prompt、TUI 菜单等需要
    // 人为介入的情况。要求**严格回一个词**(active / idle),避免推理模型
    // 写一整段解释 — 配合下面 `normalized === 'active'` 的严格相等判定。
    const prompt =
      'You are watching the tail of a terminal session. Decide whether the ' +
      'user should look at it NOW (because the task paused, finished, errored, ' +
      'or is waiting for them), or whether they can keep working elsewhere ' +
      'because the foreground program is still running on its own.\n\n' +
      'Reply with EXACTLY ONE word and nothing else: `active` or `idle`.\n\n' +
      '`idle` = needs human attention now. Concrete signals:\n' +
      '  * A new shell prompt appears as the last line after previous output ' +
      '(the previous command returned)\n' +
      '  * Multiple lines of error/warning output followed by a new prompt\n' +
      '  * A "y/n", "Press any key", or password prompt is visible\n' +
      '  * A TUI shows a menu, dialog, or confirmation awaiting selection\n\n' +
      '`active` = leave it alone, work continues. Concrete signals:\n' +
      '  * The last line is `prompt> command` with NO new prompt below it ' +
      '(the command is currently executing — covers sleep, wait, network ' +
      'calls, blocked IO, long compiles, even a debugger paused at a breakpoint)\n' +
      '  * A dev server / watcher / Vite / webpack is printing logs\n' +
      '  * A TUI (vim / htop / claude code / lazygit) is in normal operation ' +
      '(not blocked on a dialog)\n' +
      '  * A spinner or progress bar is still animating\n\n' +
      '--- terminal tail ---\n' +
      scrollbackTail +
      '\n--- end ---\n';

    // BETA-006 排障日志:把喂给 LLM 的 tail 完整落盘 — 排"为什么 sleep
     // 被判 idle"这类问题必须看到 LLM 收到的原始字节(含 ANSI/控制符,
     // JSON 序列化里会 \uXXXX 转义)。tail 上限 2KB,一次约 2-3KB,
     // 5MB 日志文件能撑 1k+ 次复核,够用。
    const modelUsed =
      model || (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);
    logger.info(
      'AIClient',
      `recheckIdle → ${provider} ${modelUsed} tail.len=${scrollbackTail.length}`,
      { tail: scrollbackTail },
    );

    let text: string;
    try {
      // max_tokens 给 8192:推理模型(kimi-k2.5 / deepseek-r1 等)把
      // reasoning token 与 visible content 一起计入 completion_tokens,
      // 原来的 8 在推理模型下 100% 被思考过程吃光、content 永远是空串,
      // 后果是 verdict 一律 go-idle、复核形同虚设。8192 给推理模型留足
      // 思考空间,防止重深推理被截断;纯 chat 模型遇到 stop word 后会
      // 提前终止,不会真的产出 8K token,实际开销与短上限等价。
      const maxTokens = 8192;
      if (provider === 'anthropic') {
        const client = new Anthropic(clientOptions(apiKey, baseURL));
        const res = await client.messages.create({
          model: modelUsed,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });
        // 完整 res 落盘 — 排"为什么 content 为空"要看 stop_reason / usage
        logger.info('AIClient', 'recheckIdle ← anthropic raw res', { res });
        // Anthropic content 是 array of blocks;取首个 text block
        const block = res.content[0];
        text = block && block.type === 'text' ? block.text : '';
      } else {
        const client = new OpenAI(clientOptions(apiKey, baseURL));
        const res = await client.chat.completions.create({
          model: modelUsed,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });
        // 完整 res 落盘 — 排"为什么 content 为空"要看 finish_reason /
        // usage / message(可能有 reasoning_content 等非标字段)
        logger.info('AIClient', 'recheckIdle ← openai raw res', { res });
        text = res.choices[0]?.message?.content ?? '';
      }
    } catch (err) {
      logger.warn('AIClient', 'recheckIdle LLM call threw', err);
      throw err;
    }

    // 严格相等判定:旧版用 includes('active'),会把 "idle, not active" 也算
     // keep-active(子串误判)。新 prompt 要求"EXACTLY ONE word",严格等比
     // 子串安全。命中不到 active 就 go-idle —— LLM 偶尔啰嗦也偏保守地"让
     // 状态点亮起来"(idle 一侧是"提醒用户看",误报代价低于漏报)。
    const normalized = text.trim().toLowerCase();
    const verdict: 'keep-active' | 'go-idle' =
      normalized === 'active' ? 'keep-active' : 'go-idle';
    logger.info(
      'AIClient',
      `recheckIdle ← raw=${JSON.stringify(text)} verdict=${verdict}`,
    );
    return verdict;
  }
}
