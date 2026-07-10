type EnterEventLike = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

type SubmitOnEnterOptions = {
  requireModifier?: boolean;
};

export function shouldSubmitOnEnter(
  ev: EnterEventLike,
  isComposingText = false,
  options: SubmitOnEnterOptions = {},
): boolean {
  if (ev.key !== "Enter") return false;
  if (isComposingText || ev.isComposing || ev.keyCode === 229) return false;
  if (options.requireModifier) return !!(ev.metaKey || ev.ctrlKey);
  return true;
}
