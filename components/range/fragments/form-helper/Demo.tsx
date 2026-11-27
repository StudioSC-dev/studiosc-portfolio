"use client";

import { useEffect, useRef, useState } from "react";
import { MESSAGE, SCRIPT_A, SCRIPT_B } from "./scripts";

/** The board staggers its words 45ms apart. */
const WORD_MS = 45;

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The form helper (range-light-desktop, range-phone): a scripted draft that
 * streams in word by word. Nothing is requested: the two replies are text in
 * this file. The stream is for the eye, so it is hidden from assistive
 * technology, and a polite region says the whole reply once it has ended.
 */
export default function FormHelper() {
  /** Drafts completed, and so which script comes next. */
  const [drafts, setDrafts] = useState(0);
  const [script, setScript] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [announced, setAnnounced] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const streaming = script !== null && shown < script.split(" ").length;

  useEffect(() => () => window.clearInterval(timer.current), []);

  const draft = () => {
    // A draft already streaming keeps running.
    if (streaming) return;
    const next = drafts % 2 === 0 ? SCRIPT_A : SCRIPT_B;
    const words = next.split(" ");
    const finish = () => {
      window.clearInterval(timer.current);
      setScript(next);
      setShown(words.length);
      setDrafts((n) => n + 1);
      setAnnounced(next);
    };
    if (reduced()) {
      finish();
      return;
    }
    setScript(next);
    setShown(0);
    let count = 0;
    timer.current = window.setInterval(() => {
      count += 1;
      if (count >= words.length) finish();
      else setShown(count);
    }, WORD_MS);
  };

  const words = script ? script.split(" ").slice(0, shown) : [];
  return (
    <div
      data-fragment="form-helper"
      data-lab-demo="form-helper"
      className="rounded-fragment border border-[var(--frag-form-line)] bg-[var(--frag-form-bg)] p-5 text-left text-[var(--frag-form-ink)]"
    >
      <p className="text-[0.8125rem] leading-5 font-semibold text-[var(--frag-form-muted)]">
        Customer message
      </p>
      <p className="mt-1.5 rounded-[6px] border border-[var(--frag-form-line)] bg-[var(--frag-form-field)] px-4 py-3 text-[0.9375rem] leading-6">
        {MESSAGE}
      </p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-[0.8125rem] leading-5 font-semibold text-[var(--frag-form-muted)]">
          Reply draft
        </p>
        <button
          type="button"
          onClick={draft}
          className="min-h-10 appearance-none rounded-[6px] border border-[var(--frag-form-ink)] bg-[var(--frag-form-ink)] px-[0.875rem] text-[0.875rem] leading-5 font-semibold text-[var(--frag-form-on-ink)]"
        >
          {drafts > 0 ? "Draft again" : "Draft a reply"}
        </button>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 box-border min-h-[7.5rem] rounded-[6px] border border-[var(--frag-form-draft-line)] bg-[var(--frag-form-field)] px-4 py-3 text-[0.9375rem] leading-6"
      >
        {script === null ? (
          <p className="text-[var(--frag-form-muted)]">
            The draft appears here as it is written.
          </p>
        ) : (
          <p data-draft="">
            {words.map((word, i) => (
              <span key={i}>
                {i > 0 && " "}
                <span
                  data-motion=""
                  style={{ animation: "stream-in 140ms ease-out both" }}
                >
                  {word}
                </span>
              </span>
            ))}
          </p>
        )}
      </div>
      <div role="status" className="sr-only" data-announce="">
        {announced}
      </div>
      <p className="mt-2.5 text-[0.8125rem] leading-5 text-[var(--frag-form-muted)]">
        Nothing is sent until you say so.
      </p>
    </div>
  );
}
