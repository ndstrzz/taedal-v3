import { BrowserProvider, Contract, JsonRpcSigner, parseEther } from "ethers";
import {
  CHAIN_ID,
  NFT_ADDRESS,
  NFT_MINT_PRICE_WEI,
  NFT_MINT_PRICE_ETH,
} from "./config";

const CANDIDATE_ABIS = [
  // Mint with tokenURI
  [
    "function safeMint(address to, string uri) public returns (uint256)",
    "function tokenURI(uint256 id) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint(address to, string uri) public returns (uint256)",
    "function tokenURI(uint256 id) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint(string uri) public returns (uint256)",
    "function tokenURI(uint256 id) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMint(string uri) public returns (uint256)",
    "function tokenURI(uint256 id) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // Two-step pattern: mint(to) then setTokenURI(id, uri)
  [
    "function safeMint(address to) public returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint(address to) public returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint() public returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMint() public returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
];

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

export async function ensureConnectedOnChain(
  provider: BrowserProvider
): Promise<{ signer: JsonRpcSigner; address: string }> {
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

function getMintValue() {
  if (NFT_MINT_PRICE_WEI && /^\d+$/.test(NFT_MINT_PRICE_WEI)) {
    return BigInt(NFT_MINT_PRICE_WEI);
  }
  if (NFT_MINT_PRICE_ETH && /^[0-9.]+$/.test(NFT_MINT_PRICE_ETH)) {
    return parseEther(NFT_MINT_PRICE_ETH);
  }
  return undefined;
}

/** Resolve supported shape + plan how to call. */
function planMint(
  c: Contract
):
  | { kind: "withURI_to"; fn: "safeMint" | "mint" }
  | { kind: "withURI_self"; fn: "safeMint" | "mint" }
  | { kind: "twoStep_to"; fn: "safeMint" | "mint" }
  | { kind: "twoStep_self"; fn: "safeMint" | "mint" } {
  const I = c.interface;
  const has = (sig: string) => {
    try {
      I.getFunction(sig);
      return true;
    } catch {
      return false;
    }
  };

  if (has("safeMint(address,string)")) return { kind: "withURI_to", fn: "safeMint" };
  if (has("mint(address,string)")) return { kind: "withURI_to", fn: "mint" };
  if (has("mint(string)")) return { kind: "withURI_self", fn: "mint" };
  if (has("safeMint(string)")) return { kind: "withURI_self", fn: "safeMint" };

  if (has("safeMint(address)") && has("setTokenURI(uint256,string)"))
    return { kind: "twoStep_to", fn: "safeMint" };
  if (has("mint(address)") && has("setTokenURI(uint256,string)"))
    return { kind: "twoStep_to", fn: "mint" };
  if (has("mint()") && has("setTokenURI(uint256,string)"))
    return { kind: "twoStep_self", fn: "mint" };
  if (has("safeMint()") && has("setTokenURI(uint256,string)"))
    return { kind: "twoStep_self", fn: "safeMint" };

  throw new WalletError(
    "Mint function not found. Please update CANDIDATE_ABIS to match your contract."
  );
}

function extractTokenIdFromReceipt(c: Contract, receipt: any, toAddr: string) {
  try {
    const parsed = receipt.logs
      .map((l: any) => {
        try {
          return c.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((ev: any) => ev?.name === "Transfer");
    const selfTransfer = parsed.find(
      (ev: any) => ev?.args?.to?.toLowerCase?.() === toAddr.toLowerCase()
    );
    return selfTransfer?.args?.tokenId?.toString?.() ?? null;
  } catch {
    return null;
  }
}

export async function mintWithMetaMask(
  tokenURI: string
): Promise<{ txHash: string; tokenId: string | null; minter: string }> {
  if (!NFT_ADDRESS) throw new WalletError("NFT contract address missing");
  if (!tokenURI) throw new WalletError("Missing tokenURI");

  const provider = await getMetaMaskProvider();
  const { signer, address } = await ensureConnectedOnChain(provider);

  // Build a contract from any candidate ABI that fits
  let contract: Contract | null = null;
  let plan: ReturnType<typeof planMint> | null = null;

  for (const abi of CANDIDATE_ABIS) {
    const c = new Contract(NFT_ADDRESS, abi, signer);
    try {
      const p = planMint(c);
      contract = c;
      plan = p;
      break;
    } catch {
      continue;
    }
  }
  if (!contract || !plan) {
    throw new WalletError("Could not resolve a mint method for this contract.");
  }

  const value = getMintValue();

  // Preflight: static call to reveal revert reasons
  try {
    if (plan.kind === "withURI_to") {
      await (contract as any)[plan.fn].staticCall(address, tokenURI, value ? { value } : {});
    } else if (plan.kind === "withURI_self") {
      await (contract as any)[plan.fn].staticCall(tokenURI, value ? { value } : {});
    } else if (plan.kind === "twoStep_to") {
      await (contract as any)[plan.fn].staticCall(address, value ? { value } : {});
    } else {
      await (contract as any)[plan.fn].staticCall(value ? { value } : {});
    }
  } catch (e: any) {
    // ethers v6 will often include a "reason" or "shortMessage"
    const msg = e?.shortMessage || e?.data?.message || e?.message || String(e);
    throw new WalletError(`Mint would revert: ${msg}`);
  }

  // Send tx(s)
  if (plan.kind === "withURI_to") {
    const tx = await (contract as any)[plan.fn](address, tokenURI, value ? { value } : {});
    const receipt = await tx.wait();
    const tokenId = extractTokenIdFromReceipt(contract, receipt, address);
    return { txHash: receipt.hash, tokenId, minter: address };
  }

  if (plan.kind === "withURI_self") {
    const tx = await (contract as any)[plan.fn](tokenURI, value ? { value } : {});
    const receipt = await tx.wait();
    const tokenId = extractTokenIdFromReceipt(contract, receipt, address);
    return { txHash: receipt.hash, tokenId, minter: address };
  }

  // two-step: mint then setTokenURI
  const tx1 = await (contract as any)[plan.fn](
    plan.kind.endsWith("_to") ? address : (value ? { value } : {}),
    plan.kind.endsWith("_to") ? (value ? { value } : {}) : undefined
  );
  const receipt1 = await tx1.wait();
  const tokenId = extractTokenIdFromReceipt(contract, receipt1, address);

  // If the function returned tokenId directly (some contracts do), prefer that
  // but ethers v6 TransactionResponse doesn’t include returnData by default,
  // so we rely on Transfer event above.

  if (!tokenId) {
    // still continue; user can set tokenURI later in admin if needed
  } else {
    // setTokenURI step (best effort)
    try {
      const set = contract.interface.getFunction("setTokenURI(uint256,string)");
      if (set) {
        // static check first
        try {
          await (contract as any).setTokenURI.staticCall(tokenId, tokenURI);
          const tx2 = await (contract as any).setTokenURI(tokenId, tokenURI);
          await tx2.wait();
        } catch (e: any) {
          // do not hard-fail publish if setTokenURI reverts; surface info
          console.warn("[setTokenURI] skipped:", e?.shortMessage || e?.message || e);
        }
      }
    } catch {
      // no setTokenURI function
    }
  }

  return { txHash: receipt1.hash, tokenId, minter: address };
}
