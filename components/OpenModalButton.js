"use client";
import Icon from "@/components/Icon";
export default function OpenModalButton({ target, children, icon="plus", className="button primary" }) {
  return <button type="button" className={className} onClick={() => document.getElementById(target)?.showModal()}><Icon name={icon} size={17}/>{children}</button>;
}
