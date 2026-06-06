import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Logout — clears the session and returns to home.
export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
