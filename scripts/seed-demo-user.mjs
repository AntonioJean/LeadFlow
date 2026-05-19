import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const demoEmail = process.env.DEMO_ADMIN_EMAIL || "admin@softcom.com.br";
const demoPassword = process.env.DEMO_ADMIN_PASSWORD || "Prospectamos@2026";
const demoName = process.env.DEMO_ADMIN_NAME || "Administrador Softcom";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Add SUPABASE_SERVICE_ROLE_KEY to your local .env or Lovable secrets before running seed:demo.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureProfile(userId) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: demoName }, { onConflict: "id" });
  if (error) throw error;
}

async function ensureAdminRole(userId) {
  const { error } = await supabase
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
  if (error) throw error;
}

async function main() {
  const existing = await findUserByEmail(demoEmail);
  let userId = existing?.id;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: demoName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Demo user updated: ${demoEmail}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: demoName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Demo user created: ${demoEmail}`);
  }

  await ensureProfile(userId);
  await ensureAdminRole(userId);

  console.log("");
  console.log("Demo login ready:");
  console.log(`Email: ${demoEmail}`);
  console.log(`Password: ${demoPassword}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
