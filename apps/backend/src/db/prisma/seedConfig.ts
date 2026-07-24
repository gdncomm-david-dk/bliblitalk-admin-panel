export function resolveSeedPassword(env: NodeJS.ProcessEnv): string {
  const password = env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Add it to apps/backend/.env before running the seed script " +
        "— this is a local dev credential only, never committed to source.",
    );
  }
  return password;
}
