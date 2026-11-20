// Display labels shared between pages.

export const PURCHASE_STATUS = {
  ORDERED: { label: "Waiting for delivery", style: "bg-warn-soft text-warn" },
  RECEIVED: { label: "Received", style: "bg-good-soft text-good" },
  CANCELLED: { label: "Cancelled", style: "bg-canvas text-muted" },
} as const;

export const PAYMENT_LABEL = { CASH: "Cash", MOBILE_MONEY: "Mobile money", ON_ACCOUNT: "On account" } as const;
