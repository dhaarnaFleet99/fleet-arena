import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isInternal = !!user?.email?.endsWith(`@${INTERNAL_DOMAIN}`);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar isInternal={isInternal} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
