const ROUTER_SKILL = 'twinkstar-browser-router';

export const name = 'twinkstar-browser-router';
export const aliases = ['twinkstar-browser-router', 'twinkstar-browser', 'xingyuan-browser'];
export const description = '使用星愿浏览器路由处理登录态、动态页面和网页交互任务';
export const scope = 'session';
export const permission = 'owner';
export const usage = '/twinkstar-browser-router <网页任务>';

function routerPrompt(task) {
  const skillNote = `[Use skill: ${ROUTER_SKILL}]`;
  if (task) return `${skillNote}\n${task}`;
  return `${skillNote}\n用户已选择星愿浏览器路由入口，但尚未提供具体网页任务。请简洁询问用户要处理什么网页任务；不要打开标签页、检查浏览器状态或执行任何网页操作。`;
}

export async function handler(ctx) {
  const sessionPath = ctx?.sessionRef?.sessionPath;
  if (!sessionPath || typeof ctx?.engine?.promptSession !== 'function') {
    return { error: '当前会话不可用，无法启动星愿浏览器路由。' };
  }

  const task = String(ctx.args || '').trim();
  await ctx.engine.promptSession(sessionPath, routerPrompt(task));
  return { silent: true };
}
