"use client";

import { useId, useRef, type ToggleEvent } from "react";

const POPOVER_WIDTH = 420;
const EDGE = 8;

/** One line of text; clicking it opens the full text when it's cut off. Uses the top layer because the table's scroll area would clip anything else. */
export function NotePopover({ note }: { note: string }) {
  const id = useId();
  const line = useRef<HTMLButtonElement>(null);

  const isCut = (element: HTMLElement) => element.scrollWidth > element.clientWidth;
  const place = (event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState !== "open" || !line.current) return;
    // Phones show the whole note and short notes already fit, so there's nothing to open.
    if (!isCut(line.current)) return event.preventDefault();
    const panel = event.currentTarget;
    const anchor = line.current.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - EDGE));
    const above = window.innerHeight - anchor.bottom < 200;
    panel.dataset.above = String(above);
    panel.style.left = `${left}px`;
    panel.style.top = above ? "auto" : `${anchor.bottom + 8}px`;
    panel.style.bottom = above ? `${window.innerHeight - anchor.top + 8}px` : "auto";
    panel.style.setProperty("--arrow-left", `${anchor.left - left + 16}px`);
    window.addEventListener("scroll", () => panel.hidePopover(), { capture: true, once: true });
  };

  return (
    <>
      <button
        type="button"
        className="note-line"
        popoverTarget={id}
        ref={(element) => {
          line.current = element;
          element?.classList.toggle("is-cut", isCut(element));
        }}
      >
        {note}
      </button>
      <div className="note-popover" id={id} popover="auto" onBeforeToggle={place}>{note}</div>
    </>
  );
}
