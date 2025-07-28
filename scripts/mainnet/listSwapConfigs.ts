/**
 * Mainnet SwapConfig list viewing script
 * View all SwapConfig added in current Iceberg
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";

async function main() {
  console.log("📋 Viewing mainnet SwapConfig list...");

  // Detect network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: Currently not in mainnet environment");
  }

  // Get contract address from config file
  let poolAddress: string;

  try {
    const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    
    poolAddress = config.contracts.Iceberg;
    
    console.log("📖 Reading address from config file");
    console.log("🏠 Iceberg:", poolAddress);
  } catch (error) {
    console.log("❌ mainnet-deployment.json config file not found");
    console.log("Please execute deployment script first");
    process.exit(1);
  }

  // Set token addresses based on network
  let usdcAddress: string;
  let usdtAddress: string;
  let daiAddress: string;
  
  if (network.chainId === 42161) {
    // Arbitrum One mainnet token addresses
    usdcAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // USDC.e on Arbitrum
    usdtAddress = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum  
    daiAddress = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"; // DAI on Arbitrum
  } else if (network.chainId === 1) {
    // Ethereum mainnet token addresses
    usdcAddress = "0xA0b86a33E6441B8d08A88C57226F14B1ead5BeF3"; // USDC on Ethereum
    usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT on Ethereum
    daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"; // DAI on Ethereum
  } else {
    throw new Error("Unsupported network, please run on Arbitrum or Ethereum mainnet");
  }

  try {
    // Connect to Iceberg contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // Get next config ID, current total configs = nextSwapConfigId - 1
    const nextConfigId = await pool.nextSwapConfigId();
    const totalConfigs = nextConfigId.toNumber() - 1;
    
    console.log("\n📊 SwapConfig statistics:");
    console.log(`📈 Total config count: ${totalConfigs}`);
    console.log(`🔢 Next config ID: ${nextConfigId.toString()}`);

    if (totalConfigs === 0) {
      console.log("\n❌ Currently no SwapConfig exists");
      console.log("💡 Please execute addSwapConfig.ts script first to add configuration");
      return;
    }

    console.log("\n📋 Detailed configuration list:");
    console.log("┌─────────┬─────────────────────────────────────────────┬─────────────────┬─────────────────┐");
    console.log("│ Config  │                  Token In                   │   Token Name    │ Fixed Amount    │");
    console.log("│   ID    │                                             │                 │                 │");
    console.log("├─────────┼─────────────────────────────────────────────┼─────────────────┼─────────────────┤");

    let validConfigs = 0;
    let totalETHValue = ethers.BigNumber.from(0);

    for (let i = 1; i <= totalConfigs; i++) {
      try {
        const config = await pool.getSwapConfig(i);
        
        // Determine token name and decimals
        let tokenName: string;
        let decimals: number;
        let formattedAmount: string;
        
        if (config.tokenIn === ethers.constants.AddressZero) {
          tokenName = "ETH";
          decimals = 18;
          formattedAmount = ethers.utils.formatEther(config.fixedAmount);
          totalETHValue = totalETHValue.add(config.fixedAmount);
        } else if (config.tokenIn === usdcAddress) {
          tokenName = "USDC";
          decimals = 6;
          formattedAmount = ethers.utils.formatUnits(config.fixedAmount, 6);
        } else if (config.tokenIn === usdtAddress) {
          tokenName = "USDT";
          decimals = 6;
          formattedAmount = ethers.utils.formatUnits(config.fixedAmount, 6);
        } else if (config.tokenIn === daiAddress) {
          tokenName = "DAI";
          decimals = 18;
          formattedAmount = ethers.utils.formatEther(config.fixedAmount);
        } else {
          tokenName = "Unknown";
          decimals = 18;
          formattedAmount = config.fixedAmount.toString();
        }

        // Format display
        const configIdStr = i.toString().padStart(7);
        const tokenInStr = config.tokenIn.substring(0, 20) + "..." + config.tokenIn.substring(38);
        const tokenNameStr = tokenName.padEnd(15);
        const amountStr = (formattedAmount + " " + tokenName).padEnd(15);

        console.log(`│ ${configIdStr} │ ${tokenInStr} │ ${tokenNameStr} │ ${amountStr} │`);
        validConfigs++;

      } catch (error) {
        console.log(`│ ${i.toString().padStart(7)} │ ${" ".repeat(43)} │ ${"INVALID".padEnd(15)} │ ${"N/A".padEnd(15)} │`);
      }
    }

    console.log("└─────────┴─────────────────────────────────────────────┴─────────────────┴─────────────────┘");

    // Statistics
    console.log("\n📊 Configuration statistics:");
    console.log(`✅ Valid configurations: ${validConfigs}`);
    console.log(`❌ Invalid configurations: ${totalConfigs - validConfigs}`);
    
    if (totalETHValue.gt(0)) {
      console.log(`💰 Total ETH configuration value: ${ethers.utils.formatEther(totalETHValue)} ETH`);
    }

    // Statistics grouped by token type
    console.log("\n🏷️ Statistics by Token type:");
    const tokenStats: { [key: string]: { count: number; totalAmount: ethers.BigNumber; decimals: number } } = {};

    for (let i = 1; i <= totalConfigs; i++) {
      try {
        const config = await pool.getSwapConfig(i);
        
        let tokenName: string;
        let decimals: number;
        
        if (config.tokenIn === ethers.constants.AddressZero) {
          tokenName = "ETH";
          decimals = 18;
        } else if (config.tokenIn === usdcAddress) {
          tokenName = "USDC";
          decimals = 6;
        } else if (config.tokenIn === usdtAddress) {
          tokenName = "USDT";
          decimals = 6;
        } else if (config.tokenIn === daiAddress) {
          tokenName = "DAI";
          decimals = 18;
        } else {
          tokenName = "Unknown";
          decimals = 18;
        }

        if (!tokenStats[tokenName]) {
          tokenStats[tokenName] = {
            count: 0,
            totalAmount: ethers.BigNumber.from(0),
            decimals: decimals
          };
        }

        tokenStats[tokenName].count++;
        tokenStats[tokenName].totalAmount = tokenStats[tokenName].totalAmount.add(config.fixedAmount);

      } catch (error) {
        // Ignore invalid configurations
      }
    }

    Object.entries(tokenStats).forEach(([tokenName, stats]) => {
      const totalFormatted = ethers.utils.formatUnits(stats.totalAmount, stats.decimals);
      console.log(`  ${tokenName}: ${stats.count} configurations, total amount: ${totalFormatted} ${tokenName}`);
    });

    // Get pool basic information
    console.log("\n🏦 Pool basic information:");
    const merkleRoot = await pool.getMerkleRoot();
    console.log(`🌲 Current Merkle Root: ${merkleRoot}`);
    
    const operator = await pool.operator();
    console.log(`👮 Current Operator: ${operator}`);

    // Check owner
    const owner = await pool.owner();
    console.log(`👑 Pool Owner: ${owner}`);

    console.log("\n💡 Usage recommendations:");
    if (totalConfigs === 0) {
      console.log("- Please add SwapConfig to start using");
    } else {
      console.log("- Users can choose any config ID for deposit");
      console.log("- Recommend testing small amount configurations before using large amount configurations");
      console.log("- Ensure sufficient token balance for deposit");
    }

    // Save SwapConfig list to JSON file
    console.log("\n💾 Saving configuration to file...");
    const swapConfigsData = {
      poolAddress: poolAddress,
      network: network.name,
      chainId: network.chainId,
      totalConfigs: totalConfigs,
      nextConfigId: nextConfigId.toNumber(),
      timestamp: new Date().toISOString(),
      configs: [] as any[]
    };

    // Collect all valid configurations
    for (let i = 1; i <= totalConfigs; i++) {
      try {
        const config = await pool.getSwapConfig(i);
        
        let tokenName: string;
        let decimals: number;
        
        if (config.tokenIn === ethers.constants.AddressZero) {
          tokenName = "ETH";
          decimals = 18;
        } else if (config.tokenIn === usdcAddress) {
          tokenName = "USDC";
          decimals = 6;
        } else if (config.tokenIn === usdtAddress) {
          tokenName = "USDT";
          decimals = 6;
        } else if (config.tokenIn === daiAddress) {
          tokenName = "DAI";
          decimals = 18;
        } else {
          tokenName = "Unknown";
          decimals = 18;
        }

        swapConfigsData.configs.push({
          configId: i,
          tokenIn: config.tokenIn,
          tokenName: tokenName,
          fixedAmount: config.fixedAmount.toString(),
          fixedAmountFormatted: ethers.utils.formatUnits(config.fixedAmount, decimals),
          decimals: decimals,
          isValid: true
        });

      } catch (error) {
        swapConfigsData.configs.push({
          configId: i,
          tokenIn: null,
          tokenName: "Invalid",
          fixedAmount: "0",
          fixedAmountFormatted: "0",
          decimals: 18,
          isValid: false
        });
      }
    }

    // Save to file
    const configsPath = path.join(__dirname, "../output/mainnet-swap-configs.json");
    fs.writeFileSync(configsPath, JSON.stringify(swapConfigsData, null, 2));
    console.log("💾 SwapConfig list saved to:", configsPath);
    
  } catch (error) {
    console.error("❌ Failed to view configuration:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "call revert exception")) {
      console.log("\n💡 Possible reasons:");
      console.log("- Contract address is incorrect");
      console.log("- Network connection issues");
      console.log("- Contract not yet deployed");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script execution failed:", error);
    process.exit(1);
  });