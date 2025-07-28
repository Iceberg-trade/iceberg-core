/**
 * check deployment status of mainnet contracts
 * check if the operator is correctly set
 */

import { ethers } from "hardhat";
import { getErrorMessage } from "../utils/errorUtils";

async function main() {
  console.log("🔍 check deployment status of mainnet contracts...");

  const [deployer] = await ethers.getSigners();
  console.log("📝 current account:", deployer.address);

  const network = await ethers.provider.getNetwork();
  console.log("🌐 current network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ warning: current network is not mainnet");
  }

  let poolAddress = process.argv[2];
  
  if (!poolAddress) {
    try {
      const fs = require("fs");
      const path = require("path");
      const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      poolAddress = config.contracts.Iceberg;
      console.log("📖 read contract address from config file:", poolAddress);
    } catch (error) {
      console.log("⚠️ no config file found, please provide contract address as argument");
      console.log("usage: npx hardhat run scripts/mainnet/checkDeployment.ts --network <network> -- <contract address>");
      process.exit(1);
    }
  }
  
  console.log("🏠 check contract address:", poolAddress);

  try {
    // connect to Iceberg contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // check basic info
    console.log("\n📊 contract basic info:");
    
    // check operator
    const operator = await pool.operator();
    console.log("👮 operator address:", operator);
    console.log("✅ operator is deployer:", operator.toLowerCase() === deployer.address.toLowerCase());

    // check owner
    const owner = await pool.owner();
    console.log("👑 owner address:", owner);
    console.log("✅ owner is deployer:", owner.toLowerCase() === deployer.address.toLowerCase());

    // check merkle root
    const merkleRoot = await pool.getMerkleRoot();
    console.log("🌲 Merkle Root:", merkleRoot);

    // check next swap config id
    const nextConfigId = await pool.nextSwapConfigId();
    console.log("🔢 next swap config id:", nextConfigId.toString());

    // check verifier address
    const verifierAddress = await pool.verifier();
    console.log("🔐 verifier address:", verifierAddress);

    // check contract balance
    const contractBalance = await ethers.provider.getBalance(poolAddress);
    console.log("💰 contract balance:", ethers.utils.formatEther(contractBalance), "ETH");

    // check 1inch Router integration
    try {
      const oneInchRouter = await pool.oneInchRouter();
      console.log("🔄 1inch Router address:", oneInchRouter);
      
      // check if 1inch Router address is correct
      if (network.chainId === 42161) {
        const expectedRouter = "0x111111125421cA6dc452d289314280a0f8842A65";
        if (oneInchRouter.toLowerCase() === expectedRouter.toLowerCase()) {
          console.log("✅ Arbitrum mainnet 1inch Router address is correct");
        } else {
          console.log("⚠️ 1inch Router address is not correct");
        }
      } else if (network.chainId === 1) {
        const expectedRouter = "0x77340c866Ef1Da13407D61120010F136Fad5f91C";
        if (oneInchRouter.toLowerCase() === expectedRouter.toLowerCase()) {
          console.log("✅ Ethereum mainnet 1inch Router address is correct");
        } else {
          console.log("⚠️ 1inch Router address is not correct");
        }
      }
    } catch (error) {
      console.log("❌ cannot get 1inch Router address:", getErrorMessage(error));
    }

      // network specific check
    if (network.chainId === 42161) {
      console.log("\n🌐 Arbitrum mainnet specific check:");
      console.log("  recommended gas price: 0.1 Gwei");
      console.log("  expected confirmation time: ~1 second");
    } else if (network.chainId === 1) {
      console.log("\n🌐 Ethereum mainnet specific check:");
      console.log("  current gas price:", (await ethers.provider.getGasPrice()).toString(), "wei");
      console.log("  expected confirmation time: ~15 seconds");
    }

    console.log("\n✅ mainnet contract deployment check completed!");
    console.log("💡 if the above information is correct, the contract is deployed successfully");

    // security reminder
    console.log("\n🔒 security reminder:");
    console.log("- ensure private key is securely stored");
    console.log("- regularly check contract status");
    console.log("- monitor abnormal transactions");
    console.log("- maintain backup and recovery plan");

  } catch (error) {
    console.error("❌ check failed:", getErrorMessage(error));
    console.log("\npossible reasons:");
    console.log("1. contract address is not correct");
    console.log("2. contract is not deployed to current network");
    console.log("3. network connection problem");
    console.log("4. contract code verification failed");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ script execution failed:", error);
    process.exit(1);
  });