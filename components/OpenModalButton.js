"use client";
import Icon from "@/components/Icon";

export default function OpenModalButton({ target, children, icon = null, className = "button primary" }) {
  return <button
    type="button"
    className={className}
    aria-haspopup="dialog"
    aria-controls={target}
    onClick={() => document.getElementById(target)?.showModal()}
  >
    {icon && <Icon name={icon} size={17}/>} {children}
  </button>;
}
