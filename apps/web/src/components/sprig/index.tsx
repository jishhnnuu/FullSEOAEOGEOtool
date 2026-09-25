"use client";

import { useEffect, useRef } from "react";

import { actorMarkup } from "./art";
import { startSprig } from "./engine";
import type { Crew } from "./lines";
import "./sprig.css";

/**
 * The crew: one mascot per desk, plus the CMO who checks in on them.
 *
 * Everything they are lives in this folder, and each page renders them with
 * one line, so removing them is deleting the folder and those lines. They are
 * decoration: hidden from screen readers, they take no clicks, and every page
 * is identical without them. The server renders an empty, invisible layer and
 * they appear once the browser has measured the page, so the prerendered HTML
 * and its cache are unaffected.
 *
 * `crew` picks who is on duty. "rotate" takes turns, one at a time, for pages
 * that belong to every desk, like the homepage.
 */
export function Sprig({ crew }: { crew: Crew | "rotate" }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!layer.current) return;
    return startSprig(layer.current, crew);
  }, [crew]);

  return (
    <div ref={layer} className="sprig-layer" aria-hidden="true">
      <div className="sprig" data-who="crew" dangerouslySetInnerHTML={{ __html: actorMarkup("crew") }} />
      <div className="sprig cmo" data-who="cmo" dangerouslySetInnerHTML={{ __html: actorMarkup("cmo") }} />
    </div>
  );
}
