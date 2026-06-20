type EnterEventLike = {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
};

export function shouldSubmitOnEnter(ev: EnterEventLike, isComposingText = false): boolean {
  if (ev.key !== "Enter") return false;
  if (isComposingText || ev.isComposing || ev.keyCode === 229) return false;
  return true;
}
