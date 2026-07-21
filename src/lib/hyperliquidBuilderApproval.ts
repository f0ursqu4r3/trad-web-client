import { NetworkType } from '@/lib/ws/protocol'

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

type HyperliquidBuilderApprovalAction = {
  type: 'approveBuilderFee'
  hyperliquidChain: 'Mainnet' | 'Testnet'
  signatureChainId: '0xa4b1' | '0x66eee'
  maxFeeRate: string
  builder: string
  nonce: number
}

type HyperliquidAgentApprovalAction = {
  type: 'approveAgent'
  hyperliquidChain: 'Mainnet' | 'Testnet'
  signatureChainId: '0xa4b1' | '0x66eee'
  agentAddress: string
  agentName: string
  nonce: number
}

export type SignedHyperliquidBuilderApproval = {
  action: HyperliquidBuilderApprovalAction
  nonce: number
  signature: {
    r: string
    s: string
    v: number
  }
}

export type SignedHyperliquidAgentApproval = {
  action: HyperliquidAgentApprovalAction
  nonce: number
  signature: {
    r: string
    s: string
    v: number
  }
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export const HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS = 100

export async function signHyperliquidBuilderApproval(params: {
  network: NetworkType
  userAddress: string
  builderAddress: string
}): Promise<SignedHyperliquidBuilderApproval> {
  const provider = window.ethereum
  if (!provider) {
    throw new Error('No browser wallet found. Open MetaMask or Rabby and try again.')
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  const selected = normalizeAddress(accounts?.[0] || '')
  const user = normalizeAddress(params.userAddress)
  if (!selected || selected !== user) {
    throw new Error(
      `Connected wallet must match ${params.userAddress}. Current wallet: ${accounts?.[0] || 'none'}.`,
    )
  }

  const chain = hyperliquidChain(params.network)
  const nonce = Date.now()
  const action: HyperliquidBuilderApprovalAction = {
    type: 'approveBuilderFee',
    hyperliquidChain: chain.hyperliquidChain,
    signatureChainId: chain.signatureChainId,
    maxFeeRate: formatHyperliquidBuilderFeePercent(HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS),
    builder: normalizeAddress(params.builderAddress),
    nonce,
  }

  const typedData = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: chain.chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      'HyperliquidTransaction:ApproveBuilderFee': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'maxFeeRate', type: 'string' },
        { name: 'builder', type: 'address' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    message: {
      hyperliquidChain: action.hyperliquidChain,
      maxFeeRate: action.maxFeeRate,
      builder: action.builder,
      nonce: action.nonce,
    },
  }

  const signatureHex = (await provider.request({
    method: 'eth_signTypedData_v4',
    params: [selected, JSON.stringify(typedData)],
  })) as string

  return {
    action,
    nonce,
    signature: splitSignature(signatureHex),
  }
}

export async function signHyperliquidAgentApproval(params: {
  network: NetworkType
  userAddress: string
  agentAddress: string
  agentName?: string
}): Promise<SignedHyperliquidAgentApproval> {
  const provider = window.ethereum
  if (!provider) {
    throw new Error('No browser wallet found. Open MetaMask or Rabby and try again.')
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  const selected = normalizeAddress(accounts?.[0] || '')
  const user = normalizeAddress(params.userAddress)
  if (!selected || selected !== user) {
    throw new Error(
      `Connected wallet must match ${params.userAddress}. Current wallet: ${accounts?.[0] || 'none'}.`,
    )
  }

  const agentName = (params.agentName ?? '').trim()
  if (agentName.length > 16) {
    throw new Error('Hyperliquid agent name must be 16 characters or fewer.')
  }

  const chain = hyperliquidChain(params.network)
  const nonce = Date.now()
  const action: HyperliquidAgentApprovalAction = {
    type: 'approveAgent',
    hyperliquidChain: chain.hyperliquidChain,
    signatureChainId: chain.signatureChainId,
    agentAddress: normalizeAddress(params.agentAddress),
    agentName,
    nonce,
  }

  const typedData = {
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: chain.chainId,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      'HyperliquidTransaction:ApproveAgent': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'agentAddress', type: 'address' },
        { name: 'agentName', type: 'string' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: action.hyperliquidChain,
      agentAddress: action.agentAddress,
      agentName: action.agentName,
      nonce: action.nonce,
    },
  }

  const signatureHex = (await provider.request({
    method: 'eth_signTypedData_v4',
    params: [selected, JSON.stringify(typedData)],
  })) as string

  return {
    action,
    nonce,
    signature: splitSignature(signatureHex),
  }
}

export function formatHyperliquidBuilderFeePercent(tenthsBps: number): string {
  if (!Number.isInteger(tenthsBps) || tenthsBps < 0 || tenthsBps > 100) {
    throw new Error('Hyperliquid builder fee must be between 0 and 100 tenths-bps.')
  }
  return `${(tenthsBps / 1000).toFixed(3)}%`
}

function hyperliquidChain(network: NetworkType) {
  if (network === NetworkType.Testnet) {
    return {
      hyperliquidChain: 'Testnet' as const,
      signatureChainId: '0x66eee' as const,
      chainId: 421614,
    }
  }
  return {
    hyperliquidChain: 'Mainnet' as const,
    signatureChainId: '0xa4b1' as const,
    chainId: 42161,
  }
}

function splitSignature(signature: string) {
  const hex = signature.replace(/^0x/i, '')
  if (hex.length !== 130) {
    throw new Error(`Wallet returned an invalid signature length: ${hex.length}.`)
  }
  const rawV = Number.parseInt(hex.slice(128, 130), 16)
  return {
    r: `0x${hex.slice(0, 64)}`,
    s: `0x${hex.slice(64, 128)}`,
    v: rawV < 27 ? rawV + 27 : rawV,
  }
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase()
}
