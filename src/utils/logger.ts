import * as fs from 'fs'
import * as path from 'path'

class Logger {
  private static instance: Logger
  private logFilePath: string

  private constructor() {
    // Set the path for the log file
    const logFileName = `${new Date().toISOString().replace(/-|T|:/g, '').slice(0, 12)}.log`
    this.logFilePath = path.join(__dirname, 'logs', logFileName)

    // Ensure the logs directory exists
    const logsDir = path.join(__dirname, 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir)
    }
  }

  // Get the singleton instance of the Logger
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  // Log a message with a specified level
  log(message: string, level: string = 'INFO'): void {
    // Get the current timestamp
    const timestamp = new Date().toLocaleString('zh', { hour12: false }).replace(/|/g, '')

    // Construct the log message
    const logMessage = `[${timestamp}] [${level}] ${message}\n`

    // Write the log message to the file
    fs.appendFile(this.logFilePath, logMessage, (err) => {
      if (err) {
        console.error(`Error writing to log file: ${err}`)
      }
    })

    // Also output the log message to the console
    console.log(logMessage.trim())
  }

  // Log an info level message
  info(message: string): void {
    this.log(message, 'INFO')
  }

  // Log an error level message
  error(message: string): void {
    this.log(message, 'ERROR')
  }

  // Log a warning level message
  warn(message: string): void {
    this.log(message, 'WARN')
  }
}

export default Logger
