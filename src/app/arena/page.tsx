import ShellLayout from "@/components/ShellLayout";
import ArenaClient from "./ArenaClient";
import { createClient } from "@/lib/supabase/server";

export default async function ArenaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <ShellLayout>
      <ArenaClient userId={user?.id ?? null} />
    </ShellLayout>
  );
}
