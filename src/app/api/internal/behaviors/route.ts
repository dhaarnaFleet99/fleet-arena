import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireInternalUser();
  } catch (e) {
    return e as Response;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("behavioral_flags")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}
