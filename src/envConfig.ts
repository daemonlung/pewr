import dotenv from 'dotenv'

// Load environment variables from a .env file into process.env
dotenv.config()

class EnvConfig {
  /**
   * Get an environment variable, providing a default value if it is not set.
   *
   * @param key - The key of the environment variable.
   * @param defaultValue - The default value to return if the environment variable is not set.
   * @returns The value of the environment variable or the default value.
   * @throws Will throw an error if the environment variable is not set and no default value is provided.
   */
  static get(key: string, defaultValue?: string): string {
    const value = process.env[key]
    if (value !== undefined) {
      return value
    }
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Environment variable ${key} is not set`)
  }

  /**
   * Get a boolean environment variable, providing a default value if it is not set.
   *
   * @param key - The key of the environment variable.
   * @param defaultValue - The default value to return if the environment variable is not set.
   * @returns The boolean value of the environment variable or the default value.
   * @throws Will throw an error if the environment variable is not set and no default value is provided.
   */
  static getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key]
    if (value !== undefined) {
      return Boolean(value)
    }
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Environment variable ${key} is not set`)
  }

  /**
   * Get a mandatory environment variable. Throws an error if the variable is not set.
   *
   * @param key - The key of the environment variable.
   * @returns The value of the environment variable.
   * @throws Will throw an error if the environment variable is not set.
   */
  static getMandatory(key: string): string {
    const value = this.get(key)
    if (value === undefined) {
      throw new Error(`Mandatory environment variable ${key} is not set`)
    }
    return value
  }

  /**
   * Get a byte array from an environment variable.
   *
   * @param key - The key of the environment variable.
   * @returns The byte array.
   * @throws Will throw an error if the environment variable is not set.
   */
  static getByteArray(key: string): Uint8Array {
    const value = this.getMandatory(key)
    // Remove the square brackets and split the string by commas
    const byteArray = value.replace(/[\[\]]/g, '').split(',').map(Number)
    return new Uint8Array(byteArray)
  }
}

export default EnvConfig