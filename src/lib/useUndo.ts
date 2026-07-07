"use client";

import { useCallback, useEffect, useRef } from "react";

type ActionFn = () => void | Promise<void>;
type Entry = { undo: ActionFn; redo: ActionFn };

/**
 * Cmd+Z / Ctrl+Z で取り消し、Cmd+Shift+Z / Ctrl+Shift+Z でやり直し。
 * push(逆操作, 再適用) を積むと、後入れ先出しで実行される。
 * 新しい操作を積むとやり直し履歴はクリアされる。
 * 入力欄にフォーカスがある間はブラウザ標準のテキスト取り消しを優先する。
 */
export function useUndo() {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);

  const push = useCallback((undo: ActionFn, redo: ActionFn) => {
    undoStack.current.push({ undo, redo });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.shiftKey) {
        // Redo
        const entry = redoStack.current.pop();
        if (entry) {
          e.preventDefault();
          undoStack.current.push(entry);
          entry.redo();
        }
      } else {
        // Undo
        const entry = undoStack.current.pop();
        if (entry) {
          e.preventDefault();
          redoStack.current.push(entry);
          entry.undo();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return push;
}

/** data のキーに対応する元の値を抜き出す（Partial パッチの逆操作用） */
export function pickPrev<T extends object>(
  prev: T,
  data: Partial<T>
): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(data) as (keyof T)[]) {
    out[k] = prev[k];
  }
  return out;
}
