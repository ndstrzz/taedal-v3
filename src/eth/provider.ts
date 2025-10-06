import { BrowserProvider } from 'ethers'

export async function getProvider() {
  if (!('ethereum' in window)) throw new Error('No wallet detected')
  // @ts-ignore
  const provider = new BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  return provider
}
