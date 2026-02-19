"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, LayoutDashboard, History, Brain, Download } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/arena",     icon: Zap,             label: "Arena",     internal: false },
  { href: "/history",   icon: History,         label: "Sessions",  internal: false },
];

const INTERNAL_NAV = [
  { href: "/dashboard",           icon: LayoutDashboard, label: "Analytics" },
  { href: "/dashboard/behaviors", icon: Brain,           label: "Behaviors" },
  { href: "/dashboard/export",    icon: Download,        label: "Export" },
];

export default function Sidebar({ isInternal }: { isInternal: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 220, minWidth: 220,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
        padding: "0",
      }}
    >
      {/* Logo */}
      <div style={{
        padding: "20px 20px 18px",
        borderBottom: "1px solid var(--border)",
        fontSize: 17, fontWeight: 800, letterSpacing: "-0.5px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
        fleet arena
      </div>

      {/* Nav */}
      <div style={{ padding: "12px 10px", flex: 1 }}>
        <SectionLabel>Public</SectionLabel>
        {NAV.map(item => (
          <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
        ))}

        {isInternal && (
          <>
            <SectionLabel style={{ marginTop: 12 }}>Internal</SectionLabel>
            {INTERNAL_NAV.map(item => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(item.href)}
                badge="FLEET"
              />
            ))}
          </>
        )}
      </div>

      {/* Bottom user badge */}
      {isInternal && (
        <div style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--accent2)",
          background: "rgba(192,132,252,0.05)",
        }}>
          @fleet.so
        </div>
      )}
    </nav>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "1.5px", fontWeight: 700,
      color: "var(--muted)", padding: "8px 10px 4px", textTransform: "uppercase",
      ...style,
    }}>
      {children}
    </div>
  );
}

function NavItem({
  href, icon: Icon, label, active, badge,
}: {
  href: string; icon: React.ElementType; label: string; active: boolean; badge?: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "9px 10px", borderRadius: 8, marginBottom: 2,
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        transition: "all 0.12s",
        color: active ? "var(--accent)" : "var(--muted)",
        background: active ? "rgba(79,142,247,0.1)" : "transparent",
      }}>
        <Icon size={15} />
        {label}
        {badge && (
          <span style={{
            marginLeft: "auto", fontSize: 9, letterSpacing: "0.5px",
            background: "rgba(192,132,252,0.12)", color: "var(--accent2)",
            padding: "2px 6px", borderRadius: 20, fontWeight: 700,
          }}>
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
