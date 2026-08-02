export const pluginDataReadPermission = Object.freeze({ readOnly: true });

function tabSuffix(input) {
  const targetId = typeof input?.targetId === 'string' ? input.targetId.trim() : '';
  return targetId ? ` on plugin tab ${targetId.slice(0, 12)}` : '';
}

export function browserExternalPermission(action, summary) {
  return {
    kind: 'external_side_effect',
    describeSideEffect: (input = {}) => ({
      kind: 'browser_control',
      summary: `${summary}${tabSuffix(input)}.`,
      ruleId: `twinkstar-browser-${action}`,
    }),
  };
}
