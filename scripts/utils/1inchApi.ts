/**
 * 1inch API integration module
 * Provides functionality to get real swap transaction data
 */

import fetch from 'node-fetch';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// 1inch API configuration
const ONEINCH_API_BASE = 'https://api.1inch.dev';

export interface SwapParams {
  chainId: number;
  src: string;        // Source token address (0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for ETH)
  dst: string;        // Destination token address
  amount: string;     // Source token amount (in wei)
  from: string;       // Sender address
  slippage: number;   // Slippage percentage (1-50)
  disableEstimate?: boolean;
  allowPartialFill?: boolean;
}

export interface SwapTransactionResponse {
  dstAmount: string;
  srcToken: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
  };
  dstToken: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
  };
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

/**
 * Normalize token address
 * ETH uses 1inch's special address format
 */
function normalizeTokenAddress(address: string): string {
  if (address === ethers.constants.AddressZero || address === "0x0000000000000000000000000000000000000000") {
    return "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"; // 1inch ETH address
  }
  return address;
}


/**
 * Get 1inch swap transaction data
 */
export async function getSwapTransaction(params: SwapParams): Promise<SwapTransactionResponse> {

  const queryParams = new URLSearchParams({
    src: normalizeTokenAddress(params.src),
    dst: normalizeTokenAddress(params.dst),
    amount: params.amount,
    from: params.from,
    slippage: params.slippage.toString(),
    disableEstimate: 'true', // Disable gas estimation to speed up response
  });

  if (params.allowPartialFill) {
    queryParams.set('allowPartialFill', 'true');
  }

  const url = `${ONEINCH_API_BASE}/swap/v6.0/${params.chainId}/swap?${queryParams}`;
  
  console.log("🔄 Getting 1inch transaction data:", url);

  const headers: any = {
    'Accept': 'application/json',
  };

  // If API key exists, add to headers
  if (process.env.ONEINCH_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.ONEINCH_API_KEY}`;
  } else {
    // 1inch API now requires authentication, no API key will cause access failure
    console.log("⚠️ Warning: ONEINCH_API_KEY not set, may cause authentication failure");
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const errorText = await response.text();
    
    if (response.status === 401) {
      throw new Error(`1inch API authentication failed (${response.status}): ${errorText}\nPlease set valid ONEINCH_API_KEY in .env file`);
    }
    
    throw new Error(`1inch API error (${response.status}): ${errorText}`);
  }

  const result = await response.json()
  const data = result as SwapTransactionResponse;  
  return data;
}

