"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

export default function CopyPortalLink({ url, whatsappUrl }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const current = new URL(window.location.href);
    if (current.searchParams.has("invite")) {
      current.searchParams.delete("invite");
      current.searchParams.delete("tenant");
      window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
    }
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };
  return <div className="portal-share-actions">
    <button type="button" className="button primary" onClick={copy}><Icon name={copied ? "audit" : "copy"} size={17}/>{copied ? "Copied" : "Copy secure link"}</button>
    {whatsappUrl && <a className="button secondary" href={whatsappUrl} target="_blank" rel="noreferrer"><Icon name="message" size={17}/>Share on WhatsApp</a>}
  </div>;
}
