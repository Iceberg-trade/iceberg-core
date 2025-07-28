1. get optional deposited asset list  
   refer to: `scripts/mainnet/listSwapConfigs.ts`

2. deposit  
   refer to: `scripts/mainnet/deposit.ts`  
   description: frontend service sends deposit transaction and checks tx status by `txHash`; if tx is confirmed, proceed to the next step

3. send swap instruction to backend service  
   `api/v1/swap(chainIndex, swapConfigId, nullifierHashHex, outTokenAddress, address, sign)`  
   description:

4. check swap tx status  
   `api/v1/swap_status(chainIndex, swapConfigId, nullifierHashHex, address, sign)`  
   description:

5. withdraw  
   refer to: `scripts/mainnet/withdraw.ts`  
   description: frontend service sends withdraw transaction and checks tx status by `txHash`
