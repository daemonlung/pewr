import { createJupiterApiClient, QuoteResponse } from '@jup-ag/api'
import { Connection, Keypair, VersionedTransaction, clusterApiUrl } from '@solana/web3.js'
import { Wallet } from '@project-serum/anchor'
import bs58 from 'bs58'
import { transactionSenderAndConfirmationWaiter } from './utils/transactionSender'
import { getSignature } from './utils/getSignature'
import EnvConfig from './envConfig'
import EnvKeys from './envKeys'
import axios from 'axios'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import Logger from './utils/logger'

// Create a Jupiter API client
const jupiterQuoteApi = createJupiterApiClient({ basePath: EnvConfig.get(EnvKeys.API_ENDPOINT) })

// Initialize the wallet using the private key from environment variables
const wallet = new Wallet(
    Keypair.fromSecretKey(EnvConfig.getByteArray(EnvKeys.PRIVATE_KEY))
)

// Set the API endpoint, defaulting to Solana mainnet-beta if not specified
const RPC_ENDPOINT = EnvConfig.get(EnvKeys.RPC_ENDPOINT, clusterApiUrl('mainnet-beta'))

// Create a connection to the Solana cluster
const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'processed',
    confirmTransactionInitialTimeout: 5000,
    disableRetryOnRateLimit: false,
})

// Define ANSI escape sequences for setting green color and resetting color
const green = '\x1b[32m'
const reset = '\x1b[0m'

// Initialize the logger
let logger: Logger = Logger.getInstance()

/**
 * Get a quote for swapping tokenA to tokenB
 *
 * @param tokenA - The mint address of tokenA
 * @param tokenB - The mint address of tokenB
 * @param amount - The amount of tokenA to swap (needs to be adjusted for decimals)
 * @returns The quote response from the Jupiter API
 */
export async function quote(tokenA: string, tokenB: string, amount: number) {
    const quote = await jupiterQuoteApi.quoteGet({
        inputMint: tokenA,
        outputMint: tokenB,
        amount: amount,
        slippageBps: Number(EnvConfig.get(EnvKeys.SLIPPAGE_BPS, '50')),
        onlyDirectRoutes: false,
        asLegacyTransaction: false,
    })
    if (!quote) {
        logger.error('quote: unable to quote')
        return
    }
    logger.info(`quote: ${JSON.stringify(quote, null, 2)}`)
    return quote
}

/**
 * Perform a token swap based on the provided quote
 *
 * @param quote - The quote response from the Jupiter API
 * @returns True if the swap was successful, false otherwise
 */
export async function swap(quote: QuoteResponse) {
    try {
        // Get serialized transaction
        const swapResult = await jupiterQuoteApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: false,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto',
                // prioritizationFeeLamports: {
                //     autoMultiplier: 2,
                // },
            },
        })

        // Serialize the transaction
        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64')
        var transaction = VersionedTransaction.deserialize(swapTransactionBuf)

        // Sign the transaction
        transaction.sign([wallet.payer])
        const signature = getSignature(transaction)

        // Check if transaction simulation is enabled
        if (EnvConfig.getBoolean(EnvKeys.SIMULATE_TRANSACTION, true)) {
            // Simulate the transaction to check if it would be successful
            const { value: simulatedTransactionResponse } = await connection.simulateTransaction(
                transaction,
                {
                    replaceRecentBlockhash: true,
                    commitment: 'processed',
                }
            )
            const { err, logs } = simulatedTransactionResponse

            if (err) {
                // Log simulation error details
                logger.error('swap: Simulation Error:')
                logger.info(`swap: ${JSON.stringify(err, null, 2)}`)
                logger.error(`swap: ${logs}`)
                return false
            }
        }

        const serializedTransaction = Buffer.from(transaction.serialize())
        const blockhash = transaction.message.recentBlockhash

        const transactionResponse = await transactionSenderAndConfirmationWaiter({
            connection,
            serializedTransaction,
            blockhashWithExpiryBlockHeight: {
                blockhash,
                lastValidBlockHeight: swapResult.lastValidBlockHeight,
            },
        })

        // Check if the transaction was confirmed
        if (!transactionResponse) {
            logger.error('swap: Transaction not confirmed')
            return false
        }

        if (transactionResponse.meta?.err) {
            console.log(transactionResponse)
            logger.error(`swap: ${transactionResponse.meta?.err}`)
            return false
        }

        // Log the transaction hash
        logger.info(`swap: Transaction hash https://solscan.io/tx/${signature}`)
        return true
    } catch (error) {
        // Log any errors that occur during the swap process
        console.log(`swap error: ${error}`)
        logger.error(`swap: ${(error as Error).message.toString()}`)
        return false
    }
}

type Token = {
    symbol: string
    address: string
    decimals: number
}

/**
 * Download the list of tokens from the Jupiter API and save it to a file.
 *
 * @returns The list of tokens.
 */
export async function downloadTokensList(): Promise<Token[]> {
    const response = await axios.get('https://token.jup.ag/all')
    const data: Token[] = response.data.map(({ symbol, address, decimals }: Token) => ({
        symbol,
        address,
        decimals,
    }))
    await fsPromises.writeFile('token_list', JSON.stringify(data))
    return data
}

/**
 * Get the list of tokens, downloading it if necessary.
 *
 * @returns The list of tokens.
 */
export async function getTokens(): Promise<Token[]> {
    const exists = fs.existsSync('token_list')
    if (!exists) {
        await downloadTokensList()
    }
    const tokensData = await fsPromises.readFile('token_list', { encoding: 'utf-8' })
    return JSON.parse(tokensData) as Token[]
}

/**
 * Get the list of tokens as an object with addresses as keys.
 *
 * @returns An object where the keys are token addresses and the values are token details.
 */
export async function getTokensObject(): Promise<{ [address: string]: Token }> {
    const tokens = await getTokens()
    const tokensObject: { [address: string]: Token } = {}
    for (const token of tokens) {
        tokensObject[token.address] = token
    }
    return tokensObject
}

/**
 * Get the price of tokenA in terms of tokenB.
 *
 * @param ids - The address of tokenA.
 * @param vsToken - The address of tokenB.
 * @returns The price of tokenA in terms of tokenB, or undefined if the price could not be retrieved.
 */
export async function getPrice(ids: string, vsToken: string): Promise<number | undefined> {
    try {
        const response = await axios.get(`https://price.jup.ag/v4/price?ids=${ids}&vsToken=${vsToken}`)
        const data = response.data.data
        // Check if the data exists and contains the specified id
        if (data && data[ids]) {
            const price = data[ids].price
            return price
        } else {
            // If data is undefined or does not contain the specified id, return undefined
            return undefined
        }
    } catch (error) {
        // Log any errors that occur while fetching the price
        logger.error(`getPrice: ${error}`)
    }
}
