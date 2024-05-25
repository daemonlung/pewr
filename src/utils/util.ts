
/**
 * Waits for a specified amount of time.
 *
 * @param time - The amount of time to wait in milliseconds.
 * @returns A promise that resolves after the specified amount of time.
 */
export const wait = async (time: number) => new Promise((resolve) => setTimeout(resolve, time))

/**
 * Formats a Date object into a string with the format "YYYY-MM-DD HH:MM:SS".
 *
 * @param date - The Date object to format.
 * @returns A promise that resolves to the formatted date string.
 */
export async function formatDate(date: Date): Promise<string> {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * Formats the time difference between two timestamps into a human-readable string.
 *
 * @param time1 - The first timestamp in milliseconds.
 * @param time2 - The second timestamp in milliseconds.
 * @returns A promise that resolves to the formatted time difference string.
 */
export async function formatTimeDifference(time1: number, time2: number): Promise<string> {
    // Calculate the time difference in milliseconds
    let difference = Math.abs(time1 - time2)
    // Convert the time difference to hours
    let hours = Math.floor(difference / (1000 * 60 * 60))
    difference -= hours * (1000 * 60 * 60)
    // Convert the remaining time to minutes
    let minutes = Math.floor(difference / (1000 * 60))
    difference -= minutes * (1000 * 60)
    // Convert the remaining time to seconds
    let seconds = Math.floor(difference / 1000)
    // Calculate the number of days
    let days = Math.floor(hours / 24)
    hours %= 24
    // Format the time difference as a string
    let formattedTime = `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`
    return formattedTime
}

/**
 * Rounds a number to a specified number of decimal places.
 *
 * @param num - The number to round.
 * @param decimalPlaces - The number of decimal places to round to.
 * @returns The rounded number.
 */
export function roundToDecimal(num: number, decimalPlaces: number): number {
    const factor = Math.pow(10, decimalPlaces)
    return Math.round(num * factor) / factor
}