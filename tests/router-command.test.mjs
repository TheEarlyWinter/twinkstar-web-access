import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aliases,
  description,
  handler,
  name,
  permission,
  scope,
  usage,
} from '../commands/twinkstar-browser-router.js';

test('router command exposes the expected visible slash metadata', () => {
  assert.equal(name, 'twinkstar-browser-router');
  assert.deepEqual(aliases, ['twinkstar-browser-router', 'twinkstar-browser', 'xingyuan-browser']);
  assert.equal(scope, 'session');
  assert.equal(permission, 'owner');
  assert.match(description, /星愿浏览器/);
  assert.match(usage, /^\/twinkstar-browser-router/);
});

test('router command submits a supplied task with the skill invocation note', async () => {
  const calls = [];
  const result = await handler({
    args: '打开已登录的站内消息页面并读取未读通知',
    sessionRef: { sessionPath: '/sessions/test.jsonl' },
    engine: {
      async promptSession(...args) {
        calls.push(args);
      },
    },
  });

  assert.deepEqual(result, { silent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/sessions/test.jsonl');
  assert.match(calls[0][1], /^\[Use skill: twinkstar-browser-router\]/);
  assert.match(calls[0][1], /打开已登录的站内消息页面/);
});

test('router command asks for a task without touching the browser when no argument is supplied', async () => {
  const calls = [];
  await handler({
    args: '',
    sessionRef: { sessionPath: '/sessions/test.jsonl' },
    engine: {
      async promptSession(...args) {
        calls.push(args);
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /^\[Use skill: twinkstar-browser-router\]/);
  assert.match(calls[0][1], /不要打开标签页、检查浏览器状态或执行任何网页操作/);
});

test('router command reports an unavailable session instead of sending a prompt', async () => {
  const result = await handler({ args: '打开网页', sessionRef: {}, engine: {} });
  assert.deepEqual(result, { error: '当前会话不可用，无法启动星愿浏览器路由。' });
});
