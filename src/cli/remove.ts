import { removeEntry, stackPath } from "../stack.js";

/**
 * `launcher remove <slug>` — drop a server from the stack.
 * Returns 0 on success, 1 if the slug wasn't in the stack.
 */
export function removeFromStack(slug: string): number {
  const removed = removeEntry(slug);
  if (!removed) {
    console.error(
      `"${slug}" is not in your stack. Run \`curatedmcp list\` to see what is.`
    );
    return 1;
  }
  console.log(
    `Removed \`${slug}\` from stack (${stackPath()}). Restart your AI client for the change to take effect.`
  );
  return 0;
}
