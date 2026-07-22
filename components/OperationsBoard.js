"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function OperationsBoard({ id, label, columns, className = "", children }) {
  const viewportRef = useRef(null);
  const [activeColumn, setActiveColumn] = useState(columns[0]?.id || "");
  const [navigation, setNavigation] = useState({ overflow: false, previous: false, next: false });
  const columnKey = useMemo(() => columns.map((column) => `${column.id}:${column.count}`).join("|"), [columns]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const updateNavigation = () => {
      const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const nodes = [...viewport.querySelectorAll("[data-board-column]")];
      if (nodes.length) {
        const closest = nodes.reduce((current, node) => {
          const distance = Math.abs(node.offsetLeft - viewport.scrollLeft);
          return !current || distance < current.distance ? { id: node.dataset.boardColumn, distance } : current;
        }, null);
        if (closest?.id) setActiveColumn(closest.id);
      }
      setNavigation({
        overflow: maximum > 4,
        previous: viewport.scrollLeft > 4,
        next: viewport.scrollLeft < maximum - 4
      });
    };

    updateNavigation();
    viewport.addEventListener("scroll", updateNavigation, { passive: true });
    const observer = new ResizeObserver(updateNavigation);
    observer.observe(viewport);
    [...viewport.children].forEach((child) => observer.observe(child));

    return () => {
      viewport.removeEventListener("scroll", updateNavigation);
      observer.disconnect();
    };
  }, [columnKey]);

  const scrollToColumn = (columnId) => {
    const viewport = viewportRef.current;
    const target = viewport?.querySelector(`[data-board-column="${columnId}"]`);
    if (!viewport || !target) return;
    viewport.scrollTo({ left: Math.max(0, target.offsetLeft - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    setActiveColumn(columnId);
  };

  const moveViewport = (direction) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * Math.max(260, viewport.clientWidth * .82), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return <section className={`operations-board-shell${navigation.overflow ? " is-scrollable" : ""}`} aria-label={label}>
    <div className="operations-board-nav">
      <div className="operations-board-tabs" aria-label={`${label} columns`}>
        {columns.map((column) => <button type="button" className={`operations-board-tab${activeColumn === column.id ? " is-active" : ""}`} aria-controls={`${id}-${column.id}`} aria-current={activeColumn === column.id ? "step" : undefined} onClick={() => scrollToColumn(column.id)} key={column.id}><span>{column.label}</span><strong>{column.count}</strong></button>)}
      </div>
      {navigation.overflow && <div className="operations-board-controls" aria-label={`${label} scroll controls`}>
        <button type="button" className="icon-button is-previous" aria-label="View previous board columns" disabled={!navigation.previous} onClick={() => moveViewport(-1)}><Icon name="arrow" size={16}/></button>
        <button type="button" className="icon-button" aria-label="View next board columns" disabled={!navigation.next} onClick={() => moveViewport(1)}><Icon name="arrow" size={16}/></button>
      </div>}
    </div>
    <div ref={viewportRef} id={id} className={`operations-board-viewport ${className}`.trim()}>{children}</div>
    {navigation.overflow && <p className="operations-board-hint">Use the status buttons or swipe horizontally to move between workflow columns.</p>}
  </section>;
}
