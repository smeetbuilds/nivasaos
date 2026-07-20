"use client";

import { useRef } from "react";
import Icon from "@/components/Icon";

export default function OpenModalButton({ target, children, icon = null, className = "button primary" }) {
  const triggerRef = useRef(null);
  const open = () => {
    const dialog = document.getElementById(target);
    if (!dialog) return;
    dialog.nivasaReturnFocus = triggerRef.current;
    dialog.showModal();
    requestAnimationFrame(() => {
      const initial = dialog.querySelector("[autofocus],.modal-close,input:not([type='hidden']):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])");
      initial?.focus({ preventScroll: true });
    });
  };
  return <button
    ref={triggerRef}
    type="button"
    className={className}
    aria-haspopup="dialog"
    aria-controls={target}
    onClick={open}
  >
    {icon && <Icon name={icon} size={17}/>} {children}
  </button>;
}
