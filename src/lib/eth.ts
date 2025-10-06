import {
  BrowserProvider,
  Contract,
  JsonRpcSigner,
  parseUnits,
  isHexString,
} from "ethers";
import { CHAIN_ID, NFT_ADDRESS } from "./config";

// --- Minimal ABIs for common mint functions ---
// Adjust/add signatures here to match your contract
const CANDIDATE_ABIS = [
  // 1) safeMint(to, tokenURI)
  [
    "function safeMint(address to, string uri) public returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // 2) mint(to, tokenURI)
  [
    "function mint(address to, string uri) public returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // 3) mint(tokenURI) — mints to msg.sender
  [
    "function mint(string uri) public returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  // 4) safeMint(tokenURI) — mints to msg.sender
  [
    "function safeMint(string uri) public returns (uint256)",
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
  const provider = new BrowserProvider(window.ethereum);
  return provider;
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
      // chain not added → optional: addChain code goes here
      throw new WalletError(
        `Wrong network. Please switch to chain ${CHAIN_ID}.`,
        e?.code
      );
    }
  }

  return { signer, address };
}

function pickContract(address: string, signer: JsonRpcSigner): {
  contract: Contract;
  fn: "safeMint_addr" | "mint_addr" | "mint" | "safeMint";
} {
  for (const abi of CANDIDATE_ABIS) {
    const c = new Contract(address, abi, signer);
    // probe function existence
    const fns = Object.keys(c.interface.functions);
    if (fns.some((f) => f.startsWith("safeMint(address,string)"))) {
      return { contract: c, fn: "safeMint_addr" };
    }
    if (fns.some((f) => f.startsWith("mint(address,string)"))) {
      return { contract: c, fn: "mint_addr" };
    }
    if (fns.some((f) => f.startsWith("mint(string)"))) {
      return { contract: c, fn: "mint" };
    }
    if (fns.some((f) => f.startsWith("safeMint(string)"))) {
      return { contract: c, fn: "safeMint" };
    }
  }
  throw new WalletError("Mint function not found in ABI — update eth.ts ABI list to match your contract.");
}

export async function mintWithMetaMask(
  tokenURI: string
): Promise<{ txHash: string; tokenId: string | null; minter: string }> {
  if (!NFT_ADDRESS) throw new WalletError("NFT contract address missing");
  if (!tokenURI) throw new WalletError("Missing tokenURI");

  const provider = await getMetaMaskProvider();
  const { signer, address } = await ensureConnectedOnChain(provider);

  const { contract, fn } = pickContract(NFT_ADDRESS, signer);

  let tx;
  if (fn === "safeMint_addr" || fn === "mint_addr") {
    tx = await (contract as any)[fn === "safeMint_addr" ? "safeMint" : "mint"](
      address,
      tokenURI
    );
  } else {
    tx = await (contract as any)[fn](tokenURI);
  }

  const receipt = await tx.wait();
  // try to find Transfer(to=address) and pick tokenId
  let tokenId: string | null = null;
  try {
    const transferLogs = receipt.logs
      .map((l: any) => {
        try {
          return contract.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((ev: any) => ev?.name === "Transfer");

    const selfTransfer = transferLogs.find(
      (ev: any) => ev?.args?.to?.toLowerCase?.() === address.toLowerCase()
    );
    if (selfTransfer) {
      const id = selfTransfer.args?.tokenId?.toString?.();
      tokenId = id || null;
    }
  } catch {
    tokenId = null;
  }

  return { txHash: receipt.hash, tokenId, minter: address };
}
