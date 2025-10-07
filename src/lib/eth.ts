import {
  BrowserProvider,
  Contract,
  JsonRpcSigner,
} from "ethers";
import { CHAIN_ID, NFT_ADDRESS } from "./config";

export class WalletError extends Error {
  code?: string | number;
  constructor(message: string, code?: string | number) {
    super(message);
    this.code = code;
  }
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export async function getMetaMaskProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) {
    throw new WalletError("MetaMask not detected");
  }
  return new BrowserProvider(window.ethereum);
}

export async function ensureConnectedOnChain(provider: BrowserProvider): Promise<{
  signer: JsonRpcSigner;
  address: string;
}> {
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== Number(CHAIN_ID)) {
    try {
      await provider.send("wallet_switchEthereumChain", [
        { chainId: "0x" + Number(CHAIN_ID).toString(16) },
      ]);
    } catch (e: any) {
      throw new WalletError(
        `Wrong network. Please switch to chain ${CHAIN_ID}.`,
        e?.code
      );
    }
  }

  return { signer, address };
}

/** Tiny helper for ABI probing in ethers v6 */
function hasFn(contract: Contract, frag: string): boolean {
  try {
    contract.interface.getFunction(frag);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint via MetaMask.
 * Tries preferred Taedal-style ABI: mintWithURI(string,uint256).
 * Falls back to common signatures if the contract doesn’t have it.
 */
export async function mintWithMetaMask(
  tokenURI: string,
  artworkId?: number | string
): Promise<{ txHash: string; tokenId: string | null; minter: string }> {
  if (!NFT_ADDRESS) throw new WalletError("NFT contract address missing");
  if (!tokenURI) throw new WalletError("Missing tokenURI");

  const provider = await getMetaMaskProvider();
  const { signer, address } = await ensureConnectedOnChain(provider);

  const c = new Contract(NFT_ADDRESS, [
    // Taedal preferred
    "event ArtworkLinked(address indexed minter,uint256 indexed artworkId,uint256 indexed tokenId,string tokenURI)",
    "function mintWithURI(string uri,uint256 artworkId) returns (uint256)",
    // Common fallbacks
    "function safeMint(address to,string uri) returns (uint256)",
    "function mint(address to,string uri) returns (uint256)",
    "function mint(string uri) returns (uint256)",
    "function safeMint(string uri) returns (uint256)",
    "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  ], signer);

  // Decide which function we can call
  let callKind:
    | "mintWithURI"
    | "safeMint_addr"
    | "mint_addr"
    | "mint"
    | "safeMint"
    | null = null;

  if (hasFn(c, "mintWithURI(string,uint256)")) callKind = "mintWithURI";
  else if (hasFn(c, "safeMint(address,string)")) callKind = "safeMint_addr";
  else if (hasFn(c, "mint(address,string)")) callKind = "mint_addr";
  else if (hasFn(c, "mint(string)")) callKind = "mint";
  else if (hasFn(c, "safeMint(string)")) callKind = "safeMint";

  if (!callKind) {
    throw new WalletError(
      "This NFT contract doesn’t expose a compatible mint function. Add mintWithURI(string,uint256) or mint(string) / mint(address,string)."
    );
  }

  // Send tx
  let tx: any;
  if (callKind === "mintWithURI") {
    // If caller didn’t pass an artworkId, use a simple ever-increasing numeric tag
    const id =
      artworkId != null
        ? BigInt(String(artworkId))
        : BigInt(Math.floor(Date.now() / 1000));
    tx = await (c as any).mintWithURI(tokenURI, id);
  } else if (callKind === "safeMint_addr" || callKind === "mint_addr") {
    tx = await (c as any)[callKind === "safeMint_addr" ? "safeMint" : "mint"](
      address,
      tokenURI
    );
  } else {
    tx = await (c as any)[callKind](tokenURI);
  }

  const receipt = await tx.wait();

  // Try to parse tokenId from logs
  let tokenId: string | null = null;
  try {
    for (const log of receipt.logs || []) {
      try {
        const parsed = c.interface.parseLog(log);
        if (parsed?.name === "ArtworkLinked" || parsed?.name === "Transfer") {
          const id = parsed.args?.tokenId?.toString?.();
          if (id) {
            tokenId = id;
            break;
          }
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  return { txHash: receipt.hash, tokenId, minter: address };
}
