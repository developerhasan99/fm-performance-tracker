// Create the first admin, or reset a lost password, straight against the database.
// Usage: npm run admin -- you@example.com
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, normalizeEmail, passwordProblem } from "../src/lib/password";

async function ask(question: string, hidden = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // Echo nothing while the password is typed.
    const write = (rl as unknown as { _writeToOutput: (s: string) => void });
    write._writeToOutput = (s: string) => { if (s.includes(question)) process.stdout.write(s); };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) process.stdout.write("\n");
  return answer;
}

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "");
  if (!email.includes("@")) throw new Error("Usage: npm run admin -- you@example.com");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    const name = existing?.name ?? ((await ask("Name: ")).trim() || email);
    const password = await ask("New password: ", true);
    const problem = passwordProblem(password);
    if (problem) throw new Error(problem);
    if ((await ask("Repeat password: ", true)) !== password) throw new Error("Passwords don't match.");

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash, role: "admin" },
      create: { email, name, passwordHash, role: "admin" },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    console.log(existing ? `Password reset for ${email}; existing sessions signed out.` : `Admin ${email} created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
