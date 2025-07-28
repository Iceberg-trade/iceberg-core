import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import * as dotenv from "dotenv";

declare module "hardhat/config" {
  interface HardhatUserConfig {
    etherscan?: any;
    gasReporter?: any;
  }
}

dotenv.config();

let accountsCache: any = null;
let hasLoggedConfig = false;

function getAccounts() {
  if (accountsCache) {
    return accountsCache;
  }

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const userBKey = process.env.USER_B_PRIVATE_KEY;
  const mnemonic = process.env.MNEMONIC;

  if (!hasLoggedConfig) {
    console.log("🔍 signer config:");
    console.log("  DEPLOYER_PRIVATE_KEY:", deployerKey ? "✅" : "❌");
    console.log("  USER_B_PRIVATE_KEY:", userBKey ? "✅" : "❌");
    console.log("  MNEMONIC:", mnemonic ? "✅" : "❌");
    hasLoggedConfig = true;
  }

  if (deployerKey && userBKey) {
    accountsCache = [deployerKey, userBKey];
  } else if (deployerKey) {
    accountsCache = [deployerKey];
  } else if (mnemonic) {
    accountsCache = { mnemonic };
  } else {
    accountsCache = {
      mnemonic: "test test test test test test test test test test test junk"
    };
  }

  return accountsCache;
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk"
      }
    },
    localhost: {
      url: process.env.TESTNET_RPC_URL || "http://127.0.0.1:8545",
      accounts: getAccounts(),
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: getAccounts(),
      chainId: 42161,
      gasPrice: "auto", 
      gas: parseInt(process.env.DEFAULT_GAS_LIMIT || "800000"), 
    },
    mainnet: {
      url: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: getAccounts(),
      chainId: 1,
      gasPrice: "auto", 
      gas: parseInt(process.env.DEFAULT_GAS_LIMIT || "8000000"),
    },
  },
  
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      arbitrumOne: process.env.ARBISCAN_API_KEY || "",
      arbitrumTestnet: process.env.ARBISCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "arbitrumOne",
        chainId: 42161,
        urls: {
          apiURL: "https://api.arbiscan.io/api",
          browserURL: "https://arbiscan.io/"
        }
      }
    ]
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  
  mocha: {
    timeout: 40000
  }
};

export default config;