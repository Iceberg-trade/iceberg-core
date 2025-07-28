
1. get optional deposited asset list
    refer to: scripts/mainnet/listSwapConfigs.ts
2. deposit
    refer to: scripts/mainnet/deposit.ts
    description: frontend service send deposit transaction and check tx status by txHash, if tx was confirmed, turn into next step
3. send swap instruction to backend service
    api/v1/swap(chainIndex,swapConfigId,nullifierHashHex,outTokenAddress,address,sign) 
    descrpiton:
4. check swap tx status
    api/v1/swap_status(chainIndex,swapConfigId,nullifierHashHex,address,sign) 
    descrpiton:
5. withdraw
    refer to: scripts/mainnet/withdraw.ts
    descrpiton: frontend service send deposit transaction and check tx status by txHash