import { createInterface } from "readline";
import { track } from "../telemetry.js";

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
 * Collect a short piece of feedback from the developer and report it (keyed by
 * anonId, with the auth token attached when signed in).
 */
export async function runFeedback(args: string[]): Promise<number> {
  // Allow non-interactive: `curatedmcp feedback "the message"`
  const inline = args.find((a) => !a.startsWith("-"));

  let message = inline;
  let rating = "";
  if (!message) {
    console.log("\nHelp us improve CuratedMCP — your answers go straight to the team.\n");
    rating = await prompt("How likely are you to recommend it? (0-10, Enter to skip): ");
    message = await prompt("What's the one thing we should fix or add? ");
  }

  if (!message && !rating) {
    console.log("No feedback entered — skipped.");
    return 0;
  }

  await track("feedback_submitted", {
    rating: rating ? Number(rating) : null,
    message: message || null,
  });

  console.log("\n✓ Thanks — feedback sent.\n");
  return 0;
}
