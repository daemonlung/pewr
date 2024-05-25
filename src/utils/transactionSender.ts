import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  TransactionExpiredBlockheightExceededError,
  VersionedTransactionResponse,
} from '@solana/web3.js'
import promiseRetry from 'promise-retry'
import { wait } from './util'
import Logger from './logger'
let logger: Logger = Logger.getInstance()

type TransactionSenderAndConfirmationWaiterArgs = {
  connection: Connection
  serializedTransaction: Buffer
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight
}

const SEND_OPTIONS = {
  skipPreflight: true,
}

/**
 * Sends a serialized transaction and waits for its confirmation.
 *
 * @param connection - The Solana connection object.
 * @param serializedTransaction - The serialized transaction to be sent.
 * @param blockhashWithExpiryBlockHeight - The blockhash and expiry block height information.
 * @returns The response of the confirmed transaction or null if the transaction expired.
 */
export async function transactionSenderAndConfirmationWaiter({
  connection,
  serializedTransaction,
  blockhashWithExpiryBlockHeight,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<VersionedTransactionResponse | null> {
  // Send the raw transaction
  const txid = await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS)

  const controller = new AbortController()
  const abortSignal = controller.signal

  // Function to resend the transaction periodically until aborted
  const abortableResender = async () => {
    while (true) {
      await wait(2_000)
      if (abortSignal.aborted) return
      try {
        await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS)
      } catch (e) {
        console.warn(`Failed to resend transaction: ${e}`)
      }
    }
  }

  try {
    abortableResender()
    const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150

    // Wait for the transaction to be confirmed or throw an error if it expires
    await Promise.race([
      connection.confirmTransaction(
        {
          ...blockhashWithExpiryBlockHeight,
          lastValidBlockHeight,
          signature: txid,
          abortSignal,
        },
        'processed'
      ),
      new Promise(async (resolve) => {
        // In case the WebSocket connection dies, poll for the transaction status
        while (!abortSignal.aborted) {
          await wait(2_000)
          const tx = await connection.getSignatureStatus(txid, {
            searchTransactionHistory: false,
          })
          if (tx?.value?.confirmationStatus === 'confirmed') {
            resolve(tx)
          }
        }
      }),
    ])
  } catch (e) {
    logger.error((e as Error).message.toString())
    if (e instanceof TransactionExpiredBlockheightExceededError) {
      // If the transaction expired, return null
      return null
    } else {
      // For other errors, return null
      return null
    }
  } finally {
    controller.abort()
  }

  // Retry fetching the transaction response in case the RPC is not synced yet
  const response = promiseRetry(
    async (retry) => {
      const response = await connection.getTransaction(txid, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      })
      if (!response) {
        retry(response)
      }
      return response
    },
    {
      retries: 5,
      minTimeout: 1e3,
    }
  )

  return response
}
