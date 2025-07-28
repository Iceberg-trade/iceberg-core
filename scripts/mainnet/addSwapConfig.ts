/**
 * Mainnet Swap configuration addition script
 * Uses wallet address A (deployer) to add swap configurations on mainnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";

async function main() {
  console.log("⚙️ Adding mainnet Swap configurations...");

  // Get deployer account (must be owner)
  const [deployer] = await ethers.getSigners();
  console.log("📝 Using account:", deployer.address);

  // Detect network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: Not currently on mainnet environment");
  }

  // Get contract address from config file
  let poolAddress: string;

  try {
    const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    
    poolAddress = config.contracts.Iceberg;
    console.log("📖 Reading contract address from config file");
  } catch (error) {
    console.log("❌ Configuration file not found");
    process.exit(1);
  }

  // Set token addresses based on network
  let usdcAddress: string;
  let usdtAddress: string;
  let wethAddress: string;
  
  if (network.chainId === 42161) {
    // Arbitrum One mainnet token addresses
    usdcAddress = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // USDC.e on Arbitrum
    usdtAddress = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum  
    wethAddress = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH on Arbitrum
    console.log("🌐 Using Arbitrum mainnet token addresses");
  } else if (network.chainId === 1) {
    // Ethereum mainnet token addresses
    usdcAddress = "0xA0b86a33E6441B8d08A88C57226F14B1ead5BeF3"; // USDC on Ethereum
    usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT on Ethereum
    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH on Ethereum
    console.log("🌐 Using Ethereum mainnet token addresses");
  } else {
    throw new Error("Unsupported network, please run on Arbitrum or Ethereum mainnet");
  }

  console.log("🏠 Contract address:", poolAddress);
  console.log("💰 Token addresses:");
  console.log("  USDC:", usdcAddress);
  console.log("  USDT:", usdtAddress);
  console.log("  WETH:", wethAddress);

  try {
    // Connect to Iceberg contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // Check current gas price
    const gasPrice = await ethers.provider.getGasPrice();
    console.log("⛽ Current Gas Price:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");

    // Add mainnet suitable Swap configurations
    console.log("\n⚙️ Starting to add mainnet Swap configurations...");

    let configCount = 0;

    // Mainnet configs use more realistic amounts (removed tokenOut, now dynamically specified)
    const configs = [
      {
        name: "ETH (0.0002 ETH)",
        tokenIn: ethers.constants.AddressZero,
        fixedAmount: ethers.utils.parseEther("0.0002") // 0.0002 ETH (~$2)
      },
      {
        name: "USDC (1 USDC)",
        tokenIn: usdcAddress,
        fixedAmount: ethers.utils.parseUnits("1", 6) // 2 USDC
      },
      {
        name: "USDT (1 USDT)",
        tokenIn: usdtAddress,
        fixedAmount: ethers.utils.parseUnits("1", 6) // 2 USDT
      }
    ];

    for (const config of configs) {
      console.log(`📤 Adding config: ${config.name}...`);
      
      // Estimate gas cost
      const gasEstimate = await pool.estimateGas.addSwapConfig(
        config.tokenIn,
        config.fixedAmount
      );
      const gasCost = gasEstimate.mul(gasPrice);
      console.log(`⛽ Estimated Gas cost: ${ethers.utils.formatEther(gasCost)} ETH`);

      const tx = await pool.addSwapConfig(
        config.tokenIn,
        config.fixedAmount,
        {
          gasLimit: gasEstimate.mul(120).div(100) // 20% buffer
        }
      );
      
      console.log(`⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      const configId = await pool.nextSwapConfigId() - 1;
      
      console.log(`✅ ${config.name} added successfully`);
      console.log(`   ConfigID: ${configId}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      console.log(`   Actual cost: ${ethers.utils.formatEther(receipt.gasUsed.mul(gasPrice))} ETH`);
      
      configCount++;
    }

    console.log(`\n🎉 Successfully added ${configCount} mainnet Swap configurations!`);
    
    // Display all current configurations
    const nextConfigId = await pool.nextSwapConfigId();
    console.log("\n📋 All current configurations:");
    let totalGasUsed = 0;
    
    for (let i = 1; i < nextConfigId; i++) {
      try {
        const config = await pool.getSwapConfig(i);
        const tokenInName = config.tokenIn === ethers.constants.AddressZero ? "ETH" : 
                          config.tokenIn === usdcAddress ? "USDC" : 
                          config.tokenIn === usdtAddress ? "USDT" : "Unknown";
        const decimals = config.tokenIn === ethers.constants.AddressZero ? 18 : 6;
        console.log(`  ConfigID ${i}: ${tokenInName}, Amount: ${ethers.utils.formatUnits(config.fixedAmount, decimals)} (tokenOut dynamically specified)`);
      } catch (error) {
        console.log(`  ConfigID ${i}: Invalid configuration`);
      }
    }

    // Update configuration file
    try {
      const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.swapConfigsAdded = true;
      config.swapConfigsTimestamp = new Date().toISOString();
      config.totalConfigs = nextConfigId.toNumber() - 1;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log("\n📄 Configuration file updated");
    } catch (error) {
      console.log("⚠️ Unable to update configuration file");
    }

    console.log("\n💡 Next step recommendations:");
    console.log("1. Execute small test transactions to verify configurations");
    console.log("2. Monitor contract status and gas usage");
    console.log("3. If operator modification needed, execute setOperator");
    console.log("4. Prepare frontend integration and user testing");

  } catch (error) {
    console.error("❌ Failed to add configurations:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "Ownable: caller is not the owner")) {
      console.log("\n💡 Error reason: Only contract owner can add configurations");
      console.log("Please ensure using the account that deployed the contract to execute this script");
    } else if (errorMessageIncludes(error, "insufficient funds")) {
      console.log("\n💡 Error reason: Insufficient account balance to pay gas fees");
      console.log("Please ensure account has sufficient ETH to pay transaction fees");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script execution failed:", error);
    process.exit(1);
  });