import * as readline from 'readline'
import { Connection, clusterApiUrl } from '@solana/web3.js'
import { getPrice, getTokens, swap, quote, getTokensObject, downloadTokensList } from './jupapi'
import { getBalanceInfo, getTokenBalance, getPublicKey } from './solWallet'
import EnvConfig from './envConfig'
import EnvKeys from './envKeys'
import { wait } from './utils/util'
import UserSetting from './settings'
import { formatDate, formatTimeDifference, roundToDecimal } from './utils/util'
import { clearScreen, moveTo, updateScreen } from './utils/screenUpdater'
import Logger from './utils/logger'

const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112'

// Configuration
const TOKEN_A = EnvConfig.getMandatory(EnvKeys.TOKEN_A)
const TOKEN_B = EnvConfig.getMandatory(EnvKeys.TOKEN_B)
// Amount of token to buy/sell
const AMOUNT = Number(EnvConfig.getMandatory(EnvKeys.AMOUNT))
// Profit percentage
const PROFIT_PERCENTAGE = Number(EnvConfig.getMandatory(EnvKeys.PROFIT)) / 100

// ANSI escape sequences for setting colors
const GREEN = '\x1b[32m'
const RESET = '\x1b[0m'
const ORANGE = '\x1b[33m'
const RED = '\x1b[31m'

// Trading variables
let currentPrice: number = -1
let sellPrice: number = -1
let buyPrice: number = -1
let startTime: Date

let tradeFlag = -1

enum TradeFlagValue {
    DEFAULT = -1,
    BUY = 1,
    SELL = 2,
}

let autoTradeFlag = true

let userSettings: UserSetting = {
    tokenASymbol: '',
    tokenAAddress: '',
    tokenADecimals: 0,
    tokenBSymbol: '',
    tokenBAddress: '',
    tokenBDecimals: 0,
}

// Trading statistics
let buyCount = 0
let sellCount = 0
let remainingAmount = 0
let totalBuyUSDCAmount = 0
let totalSellUSDCAmount = 0
let initialUSDCAmount = 0

let logger: Logger = Logger.getInstance()

async function start() {
    logger.info('Starting initialization')
    await initialize()
    logger.info('Initialization complete✅')
    logger.info('Starting🚀🌕')
    executeAutoTrade()
}

async function initialize() {
    startTime = new Date()
    await downloadTokensList()
    const tokensObject = await getTokensObject()
    const tokenA = tokensObject[TOKEN_A]
    const tokenB = tokensObject[TOKEN_B]
    if (tokenA) {
        userSettings.tokenASymbol = tokenA.symbol
        userSettings.tokenAAddress = tokenA.address
        userSettings.tokenADecimals = tokenA.decimals
    } else {
        logger.error('Please check if TokenA is correct')
        process.exit(0)
    }
    if (tokenB) {
        userSettings.tokenBSymbol = tokenB.symbol
        userSettings.tokenBAddress = tokenB.address
        userSettings.tokenBDecimals = tokenB.decimals
    } else {
        logger.error('Please check if TokenB is correct')
        process.exit(0)
    }
    const balanceInfo = await getBalanceInfo(TOKEN_B)
    if (balanceInfo && balanceInfo.tokenPrice) {
        initialUSDCAmount = balanceInfo.token * balanceInfo.tokenPrice + balanceInfo.usdc
    }

    // Add RPC and API checks
    await checkRPCConnection()
    await checkAPIConnection()
}

/**
 * Check the connection to the Solana RPC endpoint.
 */
async function checkRPCConnection() {
    try {
        // Set the API endpoint, defaulting to Solana mainnet-beta if not specified
        const RPC_ENDPOINT = EnvConfig.get(EnvKeys.RPC_ENDPOINT, clusterApiUrl('mainnet-beta'))

        // Create a connection to the Solana cluster
        const connection = new Connection(RPC_ENDPOINT, {
            commitment: 'processed',
            confirmTransactionInitialTimeout: 5000,
            disableRetryOnRateLimit: false,
        })
        const slot = await connection.getSlot()
        logger.info(`RPC connection successful. Current slot: ${slot}`)
    } catch (error) {
        logger.error(`Failed to connect to RPC endpoint: ${error}`)
        process.exit(1)
    }
}

/**
 * Check the connection to the Jupiter API.
 */
async function checkAPIConnection() {
    try {
        const tokens = await getTokens()
        if (tokens.length > 0) {
            logger.info('API connection successful. Tokens fetched successfully.')
        } else {
            throw new Error('No tokens fetched')
        }
    } catch (error) {
        logger.error(`Failed to connect to API endpoint: ${error}`)
        process.exit(1)
    }
}

/**
 * Calculate the sell price based on the current price and profit percentage
 */
function calculateSellPrice() {
    sellPrice = currentPrice + currentPrice * PROFIT_PERCENTAGE
}

/**
 * Calculate the buy price based on the current price and profit percentage
 */
function calculateBuyPrice() {
    buyPrice = currentPrice - currentPrice * PROFIT_PERCENTAGE
}

async function buyToken(decimals: number) {
    try {
        tradeFlag = TradeFlagValue.BUY
        let amount = AMOUNT
        amount = Math.floor(amount * Math.pow(10, decimals))
        await quote(TOKEN_A, TOKEN_B, amount).then((quote) => {
            if (quote) {
                logger.info(
                    `📉 Starting to buy ${userSettings.tokenBSymbol} ${amount / Math.pow(10, decimals)} ${userSettings.tokenASymbol}`
                )
                swap(quote).then((isSuccess) => {
                    if (isSuccess) {
                        currentPrice = buyPrice
                        calculateSellPrice()
                        calculateBuyPrice()
                        buyCount++
                        remainingAmount += Number(quote.outAmount)
                        totalBuyUSDCAmount += Number(quote.inAmount)
                        logger.info(
                            `📉 Successfully bought ${userSettings.tokenBSymbol}, buy price ${currentPrice}`
                        )
                    } else {
                        logger.info(`📉 Failed to buy ${userSettings.tokenBSymbol}`)
                    }
                    tradeFlag = TradeFlagValue.DEFAULT
                })
            } else {
                tradeFlag = TradeFlagValue.DEFAULT
            }
        })
    } catch (error) {
        logger.error(`buy: ${error}`)
    } finally {
        tradeFlag = TradeFlagValue.DEFAULT
    }
}

async function sellToken(decimals: number) {
    try {
        tradeFlag = TradeFlagValue.SELL
        const price = await getPrice(TOKEN_B, TOKEN_A)
        if (!price) {
            return
        }
        let amount = AMOUNT / price
        amount = Math.floor(amount * Math.pow(10, decimals))
        await quote(TOKEN_B, TOKEN_A, amount).then((quote) => {
            if (quote) {
                logger.info(
                    `📈 Starting to sell ${userSettings.tokenBSymbol} ${amount / Math.pow(10, decimals)}`
                )
                swap(quote).then((isSuccess) => {
                    if (isSuccess) {
                        currentPrice =
                            Number(quote.outAmount) /
                            Math.pow(10, userSettings.tokenADecimals) /
                            (Number(quote.inAmount) / Math.pow(10, userSettings.tokenBDecimals))
                        calculateSellPrice()
                        calculateBuyPrice()
                        sellCount++
                        remainingAmount -= Number(quote.inAmount)
                        totalSellUSDCAmount += Number(quote.outAmount)
                        logger.info(
                            `📈 Successfully sold ${userSettings.tokenBSymbol}, sell price ${currentPrice}`
                        )
                    } else {
                        logger.info(`📈 Failed to sell ${userSettings.tokenBSymbol}`)
                    }
                    tradeFlag = TradeFlagValue.DEFAULT
                })
            } else {
                tradeFlag = TradeFlagValue.DEFAULT
            }
        })
    } catch (error) {
        logger.error(`sell: ${error}`)
    } finally {
        tradeFlag = TradeFlagValue.DEFAULT
    }
}

/**
 * Sell all tokens bought by the program
 */
async function sellAllTokens() {
    const price = await getPrice(TOKEN_B, TOKEN_A)
    if (!price) {
        return
    }
    let amount = (AMOUNT * (buyCount - sellCount)) / price
    if (amount <= 0) {
        logger.info('No need to sell')
        return
    }
    amount = Math.floor(amount * Math.pow(10, userSettings.tokenBDecimals))
    try {
        const quote_ = await quote(TOKEN_B, TOKEN_A, amount)
        if (quote_) {
            console.log(
                `📈 Selling ${userSettings.tokenBSymbol} ${amount / Math.pow(10, userSettings.tokenBDecimals)}`
            )
            const isSuccess = await swap(quote_)
            if (isSuccess) {
                logger.info(`📈 Successfully sold ${userSettings.tokenBSymbol}`)
            } else {
                logger.info(`📈 Failed to sell ${userSettings.tokenBSymbol}`)
            }
        }
    } catch (error) {
        logger.error(`Error occurred during selling: ${error}`)
        throw error
    }
}

async function updateDisplay(price: number) {
    const balanceInfo = await getBalanceInfo(TOKEN_B)
    let info: string = ''
    const maxLength = 50
    const toFixed = 4
    info += `${RESET}🚀🌕 ${RESET}\n`
    info += `${RESET}Current time: ${ORANGE}${await formatDate(new Date())}${RESET}\n`
    info += `${RESET}Run duration: ${ORANGE}${await formatTimeDifference(startTime.getTime(), new Date().getTime())}${RESET}\n`
    info += `${RESET}Wallet address: ${ORANGE}${await getPublicKey()}${RESET}\n`
    info += `${RESET}Initial total assets: ${ORANGE}${initialUSDCAmount}${RESET}\n`
    info += `${RESET}Current price: ${GREEN}${price}${RESET}\n`
    if (balanceInfo.tokenPrice) {
        const totalTokenPrice =
            (remainingAmount / Math.pow(10, userSettings.tokenBDecimals)) * balanceInfo.tokenPrice
        let profit =
            totalTokenPrice -
            (totalBuyUSDCAmount - totalSellUSDCAmount) / Math.pow(10, userSettings.tokenADecimals)
        if (sellCount > buyCount) {
            profit =
                totalTokenPrice -
                (totalSellUSDCAmount - totalBuyUSDCAmount) / Math.pow(10, userSettings.tokenADecimals)
        }
        const profitPercentage = profit / totalTokenPrice
        if (profit >= 0) {
            info +=
                `${RESET}Profit: ${GREEN}${roundToDecimal(profitPercentage, 5) * 100}%${RESET}`.padEnd(
                    maxLength
                )
        } else {
            info += `${RESET}Loss: ${RED}${roundToDecimal(profitPercentage, 5) * 100}%${RESET}`.padEnd(
                maxLength
            )
        }

        let totalProfit =
            totalSellUSDCAmount / Math.pow(10, userSettings.tokenADecimals) -
            totalBuyUSDCAmount / Math.pow(10, userSettings.tokenADecimals)
        if (sellCount > buyCount) {
            totalProfit = totalProfit - (sellCount - buyCount) * AMOUNT
        } else {
            totalProfit = totalProfit + (buyCount - sellCount) * AMOUNT
        }
        if (totalProfit >= 0) {
            info += `${RESET}Realized profit (USDC): ${GREEN}${totalProfit}${RESET}\n`
        } else {
            info += `${RESET}Realized loss (USDC): ${RED}${totalProfit}${RESET}\n`
        }

        // Correct average price calculation
        let avgPrice = totalBuyUSDCAmount / Math.pow(10, userSettings.tokenADecimals) / (remainingAmount / Math.pow(10, userSettings.tokenBDecimals))
        if (remainingAmount === 0) {
            avgPrice = 0
        }
        info += `${RESET}Average price: ${GREEN}${avgPrice}${RESET}`.padEnd(maxLength)
    }
    info += `${RESET}Holding: ${GREEN}${remainingAmount / Math.pow(10, userSettings.tokenBDecimals)}${RESET}\n`
    info += `${RESET}Buy at: ${GREEN}${buyPrice}${RESET}`.padEnd(maxLength)
    info += `${RESET}Sell at: ${GREEN}${sellPrice}${RESET}\n`
    info += `${RESET}Buys: ${GREEN}${buyCount}${RESET}`.padEnd(maxLength)
    info += `${RESET}Sells: ${GREEN}${sellCount}${RESET}\n`
    info += `${RESET}Sol balance: ${GREEN}${roundToDecimal(balanceInfo.sol, toFixed)}${RESET}`.padEnd(
        maxLength
    )
    info += `${RESET}${userSettings.tokenBSymbol} balance: ${GREEN}${roundToDecimal(balanceInfo.token, toFixed)}${RESET}\n`
    if (balanceInfo.solPrice) {
        info +=
            `${RESET}Sol price: ${GREEN}${roundToDecimal(balanceInfo.solPrice, toFixed)}${RESET}`.padEnd(
                maxLength
            )
    }
    info += `${RESET}${userSettings.tokenBSymbol} price: ${GREEN}${balanceInfo.tokenPrice}${RESET}\n`
    info += `${RESET}USDC balance: ${GREEN}${roundToDecimal(balanceInfo.usdc, 2)}${RESET}`.padEnd(
        maxLength
    )
    if (balanceInfo.tokenPrice) {
        info += `${RESET}Total value💰(${userSettings.tokenBSymbol}+USDC): ${GREEN}${roundToDecimal(balanceInfo.token * balanceInfo.tokenPrice + balanceInfo.usdc, toFixed)}${RESET}\n`
    }
    updateScreen(info)
}

async function executeAutoTrade() {
    while (autoTradeFlag) {
        try {
            const tokenADecimals = userSettings.tokenADecimals
            const tokenBDecimals = userSettings.tokenBDecimals
            const price = await getPrice(TOKEN_B, TOKEN_A)
            if (!price) {
                await waitForNextTrade()
                continue
            }
            updateDisplay(price)
            if (tradeFlag != TradeFlagValue.DEFAULT) {
                logger.info(`tradeFlag: ${tradeFlag}`)
                await waitForNextTrade()
                continue
            }
            if (sellPrice === -1 || buyPrice === -1) {
                currentPrice = price
                calculateSellPrice()
                calculateBuyPrice()
            }
            if (price > sellPrice) {
                const tokenBalance = await getTokenBalance(TOKEN_B)
                if (!tokenBalance) {
                    await waitForNextTrade()
                    continue
                }
                const totalTokenBalance = tokenBalance * price
                if (totalTokenBalance <= AMOUNT) {
                    await buyToken(tokenADecimals)
                } else {
                    if (buyCount > 0 && sellCount <= buyCount) {
                        await sellToken(tokenBDecimals)
                    } else {
                        currentPrice = price
                        calculateSellPrice()
                        calculateBuyPrice()
                    }
                }
            } else if (price < buyPrice) {
                const usdcBalance = await getTokenBalance(TOKEN_A)
                if (!usdcBalance) {
                    await waitForNextTrade()
                    continue
                }
                if (usdcBalance <= AMOUNT) {
                    await sellToken(tokenBDecimals)
                } else {
                    await buyToken(tokenADecimals)
                }
            }
        } catch (error) {
            logger.error(`autoTrade: ${error}`)
        }
        await waitForNextTrade()
    }
}

async function waitForNextTrade() {
    await wait(Number(EnvConfig.get(EnvKeys.MONITOR_PRICE_DURATION, '5000')))
}

// Create an interface for reading user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

/**
 * Handle process interruption signals
 * @param {NodeJS.SignalsListener} signal
 */
function signalHandler(signal: NodeJS.SignalsListener) {
    logger.info('👮 Program interrupted (Ctrl+C)')
    autoTradeFlag = false

    rl.question('Do you want to close positions at market price? (Y/N): ', async (answer) => {
        try {
            if (answer.toUpperCase() === 'Y') {
                logger.info('⌛️ Please wait for closing positions...')
                if (tradeFlag != TradeFlagValue.DEFAULT) {
                    logger.info('⌛️ Please be patient, waiting for other trades to complete...')
                    await wait(10000)
                }
                await sellAllTokens()
                logger.info('✅ All operations completed, program terminated😊')
                rl.close() // Close readline interface
                process.exit(0) // Exit normally
            } else {
                logger.info('❌ User canceled operation, program terminated😊')
                rl.close() // Close readline interface
                process.exit(0) // Exit normally
            }
        } catch (error) {
            logger.error(`❌ Error occurred: ${error}`)
            process.exit(1) // Exit with error
        }
    })
}

start()

rl.on('SIGINT', signalHandler)
