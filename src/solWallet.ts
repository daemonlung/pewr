import EnvConfig from './envConfig'
import EnvKeys from './envKeys'
import { Wallet } from '@project-serum/anchor'
import bs58 from 'bs58'
import solanaWeb3 from '@solana/web3.js'
import { Connection, PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js'
import { getPrice, getTokens } from './jupapi'
import { TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token'
import Logger from './utils/logger'
let logger: Logger = Logger.getInstance()

// Create a connection to the Solana cluster
const connection = new Connection(
    EnvConfig.get(EnvKeys.RPC_ENDPOINT, clusterApiUrl('mainnet-beta')),
    { commitment: 'confirmed', confirmTransactionInitialTimeout: 5000, disableRetryOnRateLimit: true }
)

const wallet = new Wallet(Keypair.fromSecretKey(EnvConfig.getByteArray(EnvKeys.PRIVATE_KEY)))

const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112'

export interface TokenValue {
    tokenMint: string
    valueInUSDC: number
}

/**
 * Get the public key of the wallet.
 *
 * @returns The public key as a base58 string.
 */
export async function getPublicKey(): Promise<string> {
    return wallet.publicKey.toBase58()
}

/**
 * Get token accounts for a given address and token mint.
 *
 * @param connection - The Solana connection object.
 * @param address - The public key of the address.
 * @param tokenMintAddress - The mint address of the token.
 * @returns The parsed token accounts.
 */
async function getTokenAccounts(
    connection: Connection,
    address: PublicKey,
    tokenMintAddress: solanaWeb3.PublicKeyInitData
) {
    return await connection.getParsedTokenAccountsByOwner(address, {
        mint: new solanaWeb3.PublicKey(tokenMintAddress),
    })
}

/**
 * Get the balance of a specific token.
 *
 * @param tokenMintAddress - The mint address of the token.
 * @returns The balance of the token.
 */
export async function getTokenBalance(tokenMintAddress: string): Promise<number> {
    try {
        if (SOL_MINT_ADDRESS === tokenMintAddress) {
            const lamports = await connection.getBalance(wallet.publicKey)
            const solBalance = lamports / solanaWeb3.LAMPORTS_PER_SOL
            return solBalance
        } else {
            const tokenAccounts = await getTokenAccounts(connection, wallet.publicKey, tokenMintAddress)
            if (tokenAccounts.value.length > 0) {
                const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount
                return balance
            }
        }
    } catch (error) {
        logger.error(`getTokenBalance:${error}`)
    }
    return 0
}

type BalanceInfo = {
    sol: number
    usdc: number
    token: number
    solPrice: number | undefined
    tokenPrice: number | undefined
}

/**
 * Get balance information for SOL, USDC, and a specific token.
 *
 * @param mintAddress - The mint address of the token.
 * @returns An object containing balance information.
 */
export async function getBalanceInfo(mintAddress: string): Promise<BalanceInfo> {
    // Get SOL balance
    const sol = await getTokenBalance(SOL_MINT_ADDRESS)
    // Get USDC balance
    const usdc = await getTokenBalance(USDC_MINT_ADDRESS)
    // Get token balance
    const token = await getTokenBalance(mintAddress)
    // Get SOL price in USDC
    const solPrice = await getPrice(SOL_MINT_ADDRESS, USDC_MINT_ADDRESS)
    // Get token price in USDC
    const tokenPrice = await getPrice(mintAddress, USDC_MINT_ADDRESS)
    return { sol, usdc, token, solPrice, tokenPrice }
}

/**
 * Get the number of decimals for a specific token.
 *
 * @param tokenMintAddress - The mint address of the token.
 * @returns The number of decimals for the token.
 */
export async function getTokenDecimals(tokenMintAddress: string): Promise<number> {
    // Convert the token mint address to a PublicKey
    const mintPublicKey = new PublicKey(tokenMintAddress)
    // Use getMint function to get token information
    const mintInfo = await getMint(connection, mintPublicKey)
    // Get decimals from mintInfo
    const decimals = mintInfo.decimals
    return decimals
}
