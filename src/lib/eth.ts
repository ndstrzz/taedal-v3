// src/lib/eth.ts — ethers v6 compatible, prefers window.__CONFIG__
import { ethers } from 'ethers'

// Resolve runtime / env
const WIN  = (typeof window !== 'undefined' ? (window as any).__CONFIG__ : undefined) || {}
const VITE = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {}
const CRA  = typeof process !== 'undefined' ? (process as any).env || {} : {}
const LS   = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => '' }

export const NFT_ADDRESS: string =
  (WIN.NFT_ADDRESS as string) ||
  (CRA?.REACT_APP_NFT_ADDRESS as string) ||
  (VITE?.VITE_NFT_ADDRESS as string) ||
  (LS.getItem('NFT_ADDRESS') as string) ||
  ''

export const CHAIN_ID: number = Number(
  WIN.CHAIN_ID ?? CRA?.REACT_APP_CHAIN_ID ?? VITE?.VITE_CHAIN_ID ?? 11155111
)

const CHAIN: Record<number, any> = {
  11155111: {
    chainIdHex: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerTx: 'https://sepolia.etherscan.io/tx/',
    blockExplorerToken: 'https://sepolia.etherscan.io/token/',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
}

const ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true,  internalType: 'address', name: 'minter',    type: 'address' },
      { indexed: true,  internalType: 'uint256', name: 'artworkId', type: 'uint256' },
      { indexed: true,  internalType: 'uint256', name: 'tokenId',   type: 'uint256' },
      { indexed: false, internalType: 'string',  name: 'tokenURI',  type: 'string'  },
    ],
    name: 'ArtworkLinked',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'string',  name: 'uri',       type: 'string'  },
      { internalType: 'uint256', name: 'artworkId', type: 'uint256' },
    ],
    name: 'mintWithURI',
    outputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

export function txUrl(hash: string) {
  const base = CHAIN[CHAIN_ID]?.blockExplorerTx || 'https://sepolia.etherscan.io/tx/'
  return `${base}${hash}`
}
export function tokenUrl(tokenId?: string | number | null) {
  if (tokenId == null) return null
  const base = CHAIN[CHAIN_ID]?.blockExplorerToken || 'https://sepolia.etherscan.io/token/'
  return `${base}${NFT_ADDRESS}?a=${tokenId}`
}

function getInjected() {
  const eth = (window as any).ethereum
  if (!eth) return undefined
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p: any) => p.isMetaMask)
    return mm || eth.providers[0]
  }
  return eth
}

async function ensureChainWithInjected(injected: any) {
  const cfg = CHAIN[CHAIN_ID]
  if (!cfg) return
  const current: string = await injected.request({ method: 'eth_chainId' })
  if (current?.toLowerCase() === cfg.chainIdHex) return
  try {
    await injected.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: cfg.chainIdHex }],
    })
  } catch (e: any) {
    if (e?.code === 4902) {
      await injected.request({
        method: 'wallet_addEthereumChain',
        params: [cfg],
      })
    } else {
      throw e
    }
  }
}

/** Mint and return { hash, etherscan, tokenId } — ethers v6 */
export async function mintOnChain(tokenURI: string, artworkId = 0) {
  if (!NFT_ADDRESS) throw new Error('NFT contract address not set')

  const injected = getInjected()
  if (!injected) throw new Error('No Ethereum wallet found (install MetaMask)')

  await injected.request({ method: 'eth_requestAccounts' })
  await ensureChainWithInjected(injected)

  const provider = new ethers.BrowserProvider(injected)
  const signer = await provider.getSigner()
  const contract = new ethers.Contract(NFT_ADDRESS, ABI, signer)

  let predicted: string | null = null
  try {
    const p = await (contract as any).mintWithURI.staticCall(tokenURI, artworkId)
    predicted = p?.toString?.() || null
  } catch {}

  const tx = await (contract as any).mintWithURI(tokenURI, artworkId)
  const receipt = await tx.wait()

  let tokenId: string | null = null
  try {
    for (const log of receipt?.logs || []) {
      try {
        const parsed = (contract as any).interface.parseLog(log)
        if (parsed?.name === 'ArtworkLinked') {
          tokenId = parsed.args.tokenId.toString()
          break
        }
      } catch {}
    }
    if (!tokenId && receipt?.logs) {
      const zero = ethers.ZeroAddress
      for (const log of receipt.logs) {
        try {
          const parsed = (contract as any).interface.parseLog(log)
          if (parsed?.name === 'Transfer' && String(parsed.args?.from).toLowerCase() === zero) {
            tokenId = parsed.args.tokenId.toString()
            break
          }
        } catch {}
      }
    }
  } catch {}

  if (!tokenId && predicted) tokenId = predicted

  try {
    if (tokenId != null) localStorage.setItem('lastTokenId', String(tokenId))
    if ((receipt as any)?.hash) localStorage.setItem('lastTxHash', (receipt as any).hash)
    if (NFT_ADDRESS) localStorage.setItem('lastContract', NFT_ADDRESS)
  } catch {}

  return { hash: (receipt as any).hash, etherscan: txUrl((receipt as any).hash), tokenId }
}

if (!NFT_ADDRESS) {
  console.warn('[eth] NFT_ADDRESS empty — set it in window.__CONFIG__, VITE_NFT_ADDRESS, or localStorage.NFT_ADDRESS')
}
