import ShellLayout from "@/components/ShellLayout";

export default function HistoryPage() {
  return (
    <ShellLayout>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{
          height: 54, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", padding: "0 24px",
          background: "var(--surface)",
        }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Sessions</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            Past sessions will appear here once you sign in.
          </div>
        </div>
      </div>
    </ShellLayout>
  );
}
