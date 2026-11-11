import { env } from "./config/env";
import { initFormData } from "./config/form-data";
import { ensureStorageDirs } from "./lib/storage";
import { createApp } from "./app";

function bootstrap(): void {
  initFormData();
  ensureStorageDirs();

  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`IGL Visa Help API listening on http://localhost:${env.PORT}`);
  });
}

bootstrap();

