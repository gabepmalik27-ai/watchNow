export type NavItem = {
  href: string;
  label: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/rate", label: "Rate" },
  { href: "/recommend", label: "Recommend" },
  { href: "/for-you", label: "For You" },
];
