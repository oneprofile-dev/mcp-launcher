import { readStack, stackPath } from "../stack.js";

/**
 * `launcher list` — print the user's current stack in human-readable form.
 */
export function listStack(): number {
  const stack = readStack();
  if (stack.entries.length === 0) {
    console.log("Your stack is empty.");
    console.log(`Add a server with \`launcher add <slug>\`.`);
    console.log(`Browse https://curatedmcp.com/marketplace to find one.`);
    return 0;
  }

  console.log(`Stack (${stackPath()}):`);
  console.log("");
  for (const e of stack.entries) {
    const flag = e.disabled ? " [disabled]" : "";
    console.log(`  • ${e.name || e.slug} (${e.slug})${flag}`);
    console.log(`      ${e.command} ${e.args.join(" ")}`);
    if (e.env && Object.keys(e.env).length > 0) {
      console.log(`      env: ${Object.keys(e.env).join(", ")}`);
    }
  }
  console.log("");
  console.log(
    `Total: ${stack.entries.length} server(s). Tools appear in your AI client as \`<slug>__<tool>\`.`
  );

  // One-line upsell — only when the user has 2+ servers, so it's relevant, not spam.
  if (stack.entries.length >= 2) {
    console.log("");
    console.log(
      `Tip: get continuous security audits for everything in your stack →`
    );
    console.log(`     https://curatedmcp.com/sentinel`);
  }
  return 0;
}
