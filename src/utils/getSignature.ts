import bs58 from 'bs58'
import { Transaction, VersionedTransaction } from '@solana/web3.js'

/**
 * Extracts and encodes the signature from a Solana transaction.
 *
 * @param transaction - The Solana transaction, which can be either a Transaction or a VersionedTransaction.
 * @returns The base58 encoded signature.
 * @throws Will throw an error if the transaction does not contain a signature.
 */
export function getSignature(transaction: Transaction | VersionedTransaction): string {
  // Determine the signature based on the type of transaction
  const signature =
    'signature' in transaction
      ? transaction.signature // For Transaction type
      : transaction.signatures[0] // For VersionedTransaction type

  // If no signature is found, throw an error
  if (!signature) {
    throw new Error(
      'Missing transaction signature, the transaction was not signed by the fee payer'
    )
  }

  // Encode the signature in base58 and return it
  return bs58.encode(signature)
}
