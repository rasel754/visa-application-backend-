import { env } from "./config/env";
import { initFormData } from "./config/form-data";
import { ensureInitialAdmin } from "./lib/admin-seed";
import { prisma } from "./lib/prisma";
import { ensureStorageDirs } from "./lib/storage";
import { createApp } from "./app";

async function bootstrap(): Promise<void> {
  initFormData();
  ensureStorageDirs();

  const seeded = await ensureInitialAdmin(prisma, {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME,
  });
  if (seeded.seeded) {
    console.log(`Seeded initial admin account: ${seeded.email}`);
  } else if (seeded.updated) {
    console.log(`Synced admin account from env: ${seeded.email}`);
  }

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`IGL Visa Help API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((err: unknown) => {
  console.error("FATAL: Failed to start IGL Visa Help API:", err);
  process.exit(1);
});

