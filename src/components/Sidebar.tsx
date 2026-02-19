"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Zap, LayoutDashboard, History, Brain, Download, LogIn, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NavItem = { href: string; icon: React.ElementType; label: string; badge?: string };

const PUBLIC_NAV: NavItem[] = [
  { href: "/arena",   icon: Zap,             label: "Arena" },
  { href: "/history", icon: History,         label: "My Sessions" },
];

const INTERNAL_NAV: NavItem[] = [
  { href: "/dashboard",          icon: LayoutDashboard, label: "Analytics",  badge: "FLEET" },
  { href: "/dashboard/behaviors",icon: Brain,           label: "Behaviors",  badge: "FLEET" },
  { href: "/dashboard/export",   icon: Download,        label: "Export",     badge: "FLEET" },
];

export default function Sidebar({
  isInternal,
  userEmail,
}: {
  isInternal: boolean;
  userEmail: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <nav style={{
      width: 220, minWidth: 220,
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh",
    }}>
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
      <div style={{ padding: "12px 10px", flex: 1, overflow: "auto" }}>
        <SectionLabel>Public</SectionLabel>
        {PUBLIC_NAV.map(item => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        {isInternal && (
          <>
            <SectionLabel style={{ marginTop: 12 }}>Internal</SectionLabel>
            {INTERNAL_NAV.map(item => (
              <NavItem key={item.href} {...item} active={pathname === item.href} />
            ))}
          </>
        )}
      </div>

      {/* Bottom — auth */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px 10px" }}>
        {userEmail ? (
          <>
            <div style={{
              padding: "6px 10px", fontSize: 11,
              fontFamily: "monospace", color: "var(--muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {userEmail}
            </div>
            <button onClick={signOut} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px", borderRadius: 8,
              background: "transparent", border: "none",
              color: "var(--muted)", cursor: "pointer", fontSize: 13,
              fontFamily: "inherit", fontWeight: 500,
            }}>
              <LogOut size={14} /> Sign out
            </button>
          </>
        ) : (
          <Link href="/login" style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 10px", borderRadius: 8,
              color: "var(--accent)", fontSize: 13, fontWeight: 600,
              background: "rgba(79,142,247,0.08)",
            }}>
              <LogIn size={14} /> Sign in
            </div>
          </Link>
        )}
      </div>
    </nav>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "1.5px", fontWeight: 700,
      color: "var(--muted)", padding: "8px 10px 4px",
      textTransform: "uppercase", ...style,
    }}>
      {children}
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active, badge }: NavItem & { active: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "9px 10px", borderRadius: 8, marginBottom: 2,
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        color: active ? "var(--accent)" : "var(--muted)",
        background: active ? "rgba(79,142,247,0.1)" : "transparent",
        transition: "all 0.12s",
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
