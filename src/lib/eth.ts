import { BrowserProvider, Contract, JsonRpcSigner, parseEther } from "ethers";
import {
  CHAIN_ID,
  NFT_ADDRESS,
  NFT_MINT_PRICE_WEI,
  NFT_MINT_PRICE_ETH,
} from "./config";

/**
 * We support many common mint shapes. Each ABI group includes the function(s)
 * we need plus Transfer so we can read tokenId from logs.
 * Add your exact signature here if you find it on Etherscan.
 */
const ABI_GROUPS: string[][] = [
  // With tokenURI, explicit recipient
  [
    "function safeMint(address to, string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint(address to, string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // With tokenURI, to msg.sender
  [
    "function mint(string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMint(string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // Popular aliases
  [
    "function publicMint(string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mintNFT(string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mintToken(string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mintTo(address to, string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMintTo(address to, string uri) public payable returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],

  // Two-step: mint then setTokenURI
  [
    "function mint(address to) public payable returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMint(address to) public payable returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function mint() public payable returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  [
    "function safeMint() public payable returns (uint256)",
    "function setTokenURI(uint256 id, string uri) public",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],

  // Optional helpers some contracts expose; we probe these later when present
  [
    "function mintPrice() view returns (uint256)",
    "function price() view returns (uint256)",
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
  if (!window.ethereum) throw new WalletError("MetaMask not detected");
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

function cfgValue() {
  if (NFT_MINT_PRICE_WEI && /^\d+$/.test(NFT_MINT_PRICE_WEI)) {
    return BigInt(NFT_MINT_PRICE_WEI);
  }
  if (NFT_MINT_PRICE_ETH && /^[0-9.]+$/.test(NFT_MINT_PRICE_ETH)) {
    return parseEther(NFT_MINT_PRICE_ETH);
  }
  return undefined;
}

type Plan =
  | { type: "withURI_to"; name: string }
  | { type: "withURI_self"; name: string }
  | { type: "twoStep_to"; name: string }
  | { type: "twoStep_self"; name: string };

function planFor(contract: Contract): Plan | null {
  const I = contract.interface;
  const has = (sig: string) => {
    try {
      I.getFunction(sig);
      return true;
    } catch {
      return false;
    }
  };

  // with URI
  if (has("safeMint(address,string)")) return { type: "withURI_to", name: "safeMint" };
  if (has("mint(address,string)")) return { type: "withURI_to", name: "mint" };
  if (has("publicMint(string)")) return { type: "withURI_self", name: "publicMint" };
  if (has("mintNFT(string)")) return { type: "withURI_self", name: "mintNFT" };
  if (has("mintToken(string)")) return { type: "withURI_self", name: "mintToken" };
  if (has("mintTo(address,string)")) return { type: "withURI_to", name: "mintTo" };
  if (has("safeMintTo(address,string)")) return { type: "withURI_to", name: "safeMintTo" };
  if (has("mint(string)")) return { type: "withURI_self", name: "mint" };
  if (has("safeMint(string)")) return { type: "withURI_self", name: "safeMint" };

  // two-step
  if (has("setTokenURI(uint256,string)")) {
    if (has("safeMint(address)")) return { type: "twoStep_to", name: "safeMint" };
    if (has("mint(address)")) return { type: "twoStep_to", name: "mint" };
    if (has("safeMint()")) return { type: "twoStep_self", name: "safeMint" };
    if (has("mint()")) return { type: "twoStep_self", name: "mint" };
  }

  return null;
}

async function tryReadMintPrice(c: Contract): Promise<bigint | undefined> {
  const I = c.interface;
  const can = (name: string) => {
    try {
      I.getFunction(name);
      return true;
    } catch {
      return false;
    }
  };
  try {
    if (can("mintPrice()")) {
      const v: bigint = await (c as any).mintPrice();
      return v;
    }
    if (can("price()")) {
      const v: bigint = await (c as any).price();
      return v;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function tokenIdFromReceipt(c: Contract, receipt: any, toAddr: string) {
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
    const mine = parsed.find(
      (ev: any) => ev?.args?.to?.toLowerCase?.() === toAddr.toLowerCase()
    );
    return mine?.args?.tokenId?.toString?.() ?? null;
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

  // Build a contract that matches any known ABI group
  let contract: Contract | null = null;
  for (const abi of ABI_GROUPS) {
    contract = new Contract(NFT_ADDRESS, abi, signer);
    const p = planFor(contract);
    if (p) break;
  }
  if (!contract) throw new WalletError("Could not resolve a mint function for this contract.");
  const plan = planFor(contract)!;

  // Decide value: contract.mintPrice() or config or undefined
  const detected = await tryReadMintPrice(contract);
  const value = detected ?? cfgValue();

  // Preflight: try both (with/without value) depending on plan to avoid “missing revert data”
  const tryStatic = async (withValue: boolean) => {
    const opt = withValue && value !== undefined ? { value } : {};
    switch (plan.type) {
      case "withURI_to":
        await (contract as any)[plan.name].staticCall(address, tokenURI, opt);
        break;
      case "withURI_self":
        await (contract as any)[plan.name].staticCall(tokenURI, opt);
        break;
      case "twoStep_to":
        await (contract as any)[plan.name].staticCall(address, opt);
        break;
      case "twoStep_self":
        await (contract as any)[plan.name].staticCall(opt);
        break;
    }
  };

  try {
    // First try with value if we have one, else without, then flip
    if (value !== undefined) {
      try {
        await tryStatic(true);
      } catch {
        await tryStatic(false);
      }
    } else {
      try {
        await tryStatic(false);
      } catch {
        await tryStatic(true);
      }
    }
  } catch (e: any) {
    const msg = e?.shortMessage || e?.data?.message || e?.message || "unknown";
    throw new WalletError(`Mint would revert: ${msg}`);
  }

  // Send the tx (mirror whatever staticCall that succeeded)
  let tx: any;
  const optsWith = value !== undefined ? { value } : {};
  try {
    switch (plan.type) {
      case "withURI_to":
        try {
          tx = await (contract as any)[plan.name](address, tokenURI, optsWith);
        } catch {
          tx = await (contract as any)[plan.name](address, tokenURI); // try w/o value
        }
        break;
      case "withURI_self":
        try {
          tx = await (contract as any)[plan.name](tokenURI, optsWith);
        } catch {
          tx = await (contract as any)[plan.name](tokenURI);
        }
        break;
      case "twoStep_to": {
        try {
          tx = await (contract as any)[plan.name](address, optsWith);
        } catch {
          tx = await (contract as any)[plan.name](address);
        }
        const receipt = await tx.wait();
        const tokenId = tokenIdFromReceipt(contract, receipt, address);

        // try setTokenURI best-effort
        try {
          contract.interface.getFunction("setTokenURI(uint256,string)");
          await (contract as any).setTokenURI.staticCall(tokenId, tokenURI);
          const tx2 = await (contract as any).setTokenURI(tokenId, tokenURI);
          await tx2.wait();
        } catch {
          // ignore; some contracts restrict this action
        }
        return { txHash: receipt.hash, tokenId, minter: address };
      }
      case "twoStep_self": {
        try {
          tx = await (contract as any)[plan.name](optsWith);
        } catch {
          tx = await (contract as any)[plan.name]();
        }
        const receipt = await tx.wait();
        const tokenId = tokenIdFromReceipt(contract, receipt, address);
        try {
          contract.interface.getFunction("setTokenURI(uint256,string)");
          await (contract as any).setTokenURI.staticCall(tokenId, tokenURI);
          const tx2 = await (contract as any).setTokenURI(tokenId, tokenURI);
          await tx2.wait();
        } catch {}
        return { txHash: receipt.hash, tokenId, minter: address };
      }
    }
  } catch (e: any) {
    const msg = e?.shortMessage || e?.data?.message || e?.message || String(e);
    throw new WalletError(`Mint send failed: ${msg}`);
  }

  const receipt = await tx.wait();
  const tokenId = tokenIdFromReceipt(contract, receipt, address);
  return { txHash: receipt.hash, tokenId, minter: address };
}
