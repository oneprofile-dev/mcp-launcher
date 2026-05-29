import { createInterface } from "readline";
import { API_URL, saveAuth, whoami } from "../auth.js";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

/**
 * Authenticate the agent to a CuratedMCP account using a personal token.
 * Token can be supplied as an arg (`login <token>`) or pasted interactively.
 */
export async function runLogin(args: string[]): Promise<number> {
  const tokenUrl = `${API_URL}/dashboard/registry`;
  let token = args.find((a) => !a.startsWith("-"));

  if (!token) {
    console.log(
      `\nGenerate an API key under your team registry (Keys tab):\n  ${tokenUrl}\n`
    );
    token = await prompt("Paste your token: ");
  }

  if (!token) {
    console.error("No token provided.");
    return 1;
  }

  const id = await whoami(token);
  if (!id) {
    console.error(
      "Token is invalid or expired. Generate a new one at " + tokenUrl
    );
    return 1;
  }

  saveAuth({
    token,
    userId: id.userId,
    email: id.email ?? undefined,
    savedAt: new Date().toISOString(),
  });

  console.log(`\n✓ Signed in${id.email ? ` as ${id.email}` : ""}.`);
  if (id.teams.length > 0) {
    console.log(`  Teams: ${id.teams.map((t) => t.slug).join(", ")}`);
    console.log(`  Run \`curatedmcp sync\` to pull your team's MCP policy.`);
  }
  return 0;
}
