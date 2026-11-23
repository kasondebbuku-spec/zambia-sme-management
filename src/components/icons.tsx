// A small set of line icons drawn in SVG, so the app needs no icon library or font download.
type P = { className?: string };

const base = (className = "size-5") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const HomeIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
  </svg>
);

export const CartIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
    <circle cx="9.5" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </svg>
);

export const ReceiptIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.2Z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);

export const BoxIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5Z" />
    <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
  </svg>
);

export const PeopleIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 4.5a3 3 0 0 1 0 6M21 20a5 5 0 0 0-3.5-4.8" />
  </svg>
);

export const TruckIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17.5" cy="18" r="1.8" />
  </svg>
);

export const LogoutIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />
  </svg>
);

export const AlertIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3 2.5 20h19Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
);

export const WalletIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H18v3" />
    <rect x="4" y="8" width="16" height="11" rx="2" />
    <circle cx="16" cy="13.5" r="1.2" />
  </svg>
);

export const ChartIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 20V4M4 20h16" />
    <path d="m7 15 4-4 3 3 5-6" />
  </svg>
);

export const PlusIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const BadgeIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M8 17a4 4 0 0 1 8 0M10 3v2h4V3" />
  </svg>
);
