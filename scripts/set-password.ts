// Sets the login password.  Usage: npx tsx --env-file=.env.local --conditions=react-server scripts/set-password.ts '<password>'
import { bumpSessionVersion, setPassword } from "@/lib/server/auth";

async function main() {
  const pw = process.argv[2];
  if (!pw || pw.length < 12) {
    console.error("Give a password of at least 12 characters.");
    process.exit(1);
  }
  await setPassword(pw);
  await bumpSessionVersion();
  console.log("Password set. All existing sessions are signed out.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
