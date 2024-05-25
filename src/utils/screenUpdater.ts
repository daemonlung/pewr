import * as readline from 'readline'

/**
 * Clears the terminal screen.
 */
export function clearScreen(): void {
  process.stdout.write('\x1Bc')
}

/**
 * Moves the cursor to the specified position (line, column) in the terminal.
 *
 * @param line - The line number to move the cursor to.
 * @param column - The column number to move the cursor to.
 */
export function moveTo(line: number, column: number): void {
  readline.cursorTo(process.stdout, column, line)
}

/**
 * Updates the terminal screen with the provided content.
 *
 * @param content - The content to display on the terminal screen.
 */
export const updateScreen = (content: string): void => {
  clearScreen() // Clear the terminal screen
  moveTo(0, 0) // Move the cursor to the top-left corner of the screen
  process.stdout.write(content) // Output the new content to the terminal
}
