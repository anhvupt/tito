const RED = "\u001b[31m";
const RESET = "\u001b[0m";

export function formatInitError(
  message: string,
  options: { tty: boolean; noColor?: boolean },
): string {
  const line = message.endsWith("\n") ? message : `${message}\n`;
  if (options.tty && options.noColor !== true) {
    return `${RED}${line}${RESET}`;
  }
  return line;
}
