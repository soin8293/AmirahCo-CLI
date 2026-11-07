// Elric's rounded ears, spotted face and muzzle, adapted for fixed-width terminals.
const FACE = [
  "       .-\"\"-.               .-\"\"-.",
  "     .' .--. '.___________.' .--. '.",
  "    /  /    \\  . o . o .  /    \\  \\",
  "   |  |      \\    . .    /      |  |",
  "    \\  \\____  ' .  o  . '  ____/  /",
  "     '.     .--------------.     .'",
  "      /  o /    __    __    \\ o  \\",
  "     / .  /   /   \\ /   \\   \\  . \\",
  "    |    |   (  o  |  o  )   |    |",
  "    | o  |    \\___/ \\___/    |  o |",
  "    |  .  \\       __        / .   |",
  "     \\ o   '.    (__)     .'   o /",
  "      '. .   \\    ||     /   . .'",
  "        '-.   '.__/\\__.'   .-'",
  "           '----.____.----' "
] as const

export function snowLeopardLines(blinking = false): string[] {
  const lines: string[] = [...FACE]
  if (blinking) lines[8] = '    |    |   ( --- | --- )   |    |'
  return lines.map(line => line.padEnd(38))
}
