import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Resolve a deep link only against the authenticated user's loaded options. */
export function useScopedSelection(key: string, options: { value: string; aliases?: string[] }[], autoSingle = false) {
  const [params] = useSearchParams();
  const preset = params.get(key) ?? '';
  const [choice, setChoice] = useState<{ preset: string; value: string }>();
  const requested = choice?.preset === preset ? choice.value : preset || (autoSingle && options.length === 1 ? options[0].value : '');
  const value = options.find(option => option.value === requested || option.aliases?.includes(requested))?.value ?? '';
  return [value, (next: string) => setChoice({ preset, value: next })] as const;
}
