"use client";

import { useEffect, useRef } from "react";

import { actorMarkup } from "./art";
import { startSprig } from "./engine";
import "./sprig.css";

/**
 * Sprig, the search page's mascot. On trial on /seo only.
 *
 * Everything he is lives in this folder, and the page renders him with one
 * line, so removing him is deleting the folder and that line. He is
 * decoration: hidden from screen readers, takes no clicks, and the page is
 * identical without him. The server renders an empty, invisible layer and he
 * appears once the browser has measured the page, so the prerendered HTML and
 * its cache are unaffected.
 */
export function Sprig() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!layer.current) return;
    return startSprig(layer.current);
  }, []);

  return (
    <div ref={layer} className="sprig-layer" aria-hidden="true">
      <div className="sprig" data-who="sprig" dangerouslySetInnerHTML={{ __html: actorMarkup("sprig") }} />
      <div className="sprig cmo" data-who="cmo" dangerouslySetInnerHTML={{ __html: actorMarkup("cmo") }} />
    </div>
  );
}
