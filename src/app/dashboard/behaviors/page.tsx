import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShellLayout from "@/components/ShellLayout";
import BehaviorsClient from "./BehaviorsClient";

const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";

export default async function BehaviorsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email?.endsWith("@" + INTERNAL_DOMAIN)) redirect("/login?reason=internal");

  return (
    <ShellLayout>
      <BehaviorsClient />
    </ShellLayout>
  );
}
