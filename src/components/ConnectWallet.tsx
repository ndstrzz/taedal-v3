import { useEffect, useState } from 'react'
import { BrowserProvider } from 'ethers'
import { CHAIN_ID } from '../lib/config'

declare global {
  interface Window {
    ethereum?: any
  }
}

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}

function toHexChain(id: number) {
  return '0x' + id.toString(16)
}

export default function ConnectWallet() {
  const [address, setAddress] = useState<string>('')
  const [chainId, setChainId] = useState<number | null>(null)
  const [err, setErr] = useState<string>('')

  async function connect() {
    try {
      setErr('')
      if (!window.ethereum) {
        setErr('No wallet found')
        return
      }
      const provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = await provider.getSigner()
      const addr = await signer.getAddress()
      const net = await provider.getNetwork()
      setAddress(addr)
      setChainId(Number(net.chainId))

      if (Number(net.chainId) !== CHAIN_ID) {
        try {
          await provider.send('wallet_switchEthereumChain', [{ chainId: toHexChain(CHAIN_ID) }])
          const n2 = await provider.getNetwork()
          setChainId(Number(n2.chainId))
        } catch (switchErr: any) {
          setErr(`Wrong network. Please switch to chain ${CHAIN_ID}.`)
        }
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to connect')
    }
  }

  useEffect(() => {
    if (!window.ethereum) return
    const onAccountsChanged = (accs: string[]) => {
      setAddress(accs?.[0] || '')
    }
    const onChainChanged = (hex: string) => {
      setChainId(parseInt(hex, 16))
    }
    window.ethereum.on?.('accountsChanged', onAccountsChanged)
    window.ethereum.on?.('chainChanged', onChainChanged)
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', onAccountsChanged)
      window.ethereum?.removeListener?.('chainChanged', onChainChanged)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={connect}
        className="rounded-lg bg-brand/20 px-3 py-1.5 text-sm text-text ring-1 ring-brand/50 hover:bg-brand/30"
      >
        {address ? short(address) : 'Connect Wallet'}
      </button>
      {err && <span className="text-xs text-error">{err}</span>}
      {address && chainId !== null && chainId !== CHAIN_ID && (
        <span className="text-xs text-warn">Switch to {CHAIN_ID}</span>
      )}
    </div>
  )
}
