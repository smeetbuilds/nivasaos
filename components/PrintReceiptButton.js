"use client";

import Icon from "@/components/Icon";

export default function PrintReceiptButton() {
  return <button type="button" className="button primary receipt-print" onClick={() => window.print()}><Icon name="receipt" size={17}/>Print or save PDF</button>;
}
