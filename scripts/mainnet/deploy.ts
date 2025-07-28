/**
 * Copyright (c) 2025 Iceberg.trade. All rights reserved.
 * 
 * This software is proprietary and confidential. Unauthorized copying,
 * distribution, or use is strictly prohibited.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Starting AnonymousSwap contract deployment to mainnet...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deployer account:", deployer.address);
  console.log("💰 Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Detect network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);

  // 0. Check Poseidon library address
  console.log("\n📚 Checking Poseidon library address...");
  const poseidonLibraryPath = path.join(__dirname, "../output/poseidon-libraries.json");
  
  if (!fs.existsSync(poseidonLibraryPath)) {
    console.log("❌ Poseidon library deployment info not found");
    console.log("Please run first: npx hardhat run scripts/mainnet/deployPoseidon.ts --network arbitrum");
    process.exit(1);
  }

  const poseidonLibraries = JSON.parse(fs.readFileSync(poseidonLibraryPath, "utf8"));
  const poseidonT3Address = poseidonLibraries.libraries.PoseidonT3;
  console.log("✅ PoseidonT3 library address:", poseidonT3Address);


  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: This script is designed for mainnet deployment (Arbitrum or Ethereum)");
    console.log("Current network is not mainnet, continuing deployment...");
  }

  // 1. Deploy Groth16Verifier
  console.log("\n📄 Deploying Groth16Verifier...");
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const withdrawVerifier = await VerifierFactory.deploy();
  await withdrawVerifier.deployed();
  console.log("✅ Groth16Verifier deployed successfully:", withdrawVerifier.address);

  // 2. Deploy WithdrawVerifierAdapter
  console.log("\n📄 Deploying WithdrawVerifierAdapter...");
  const AdapterFactory = await ethers.getContractFactory("WithdrawVerifierAdapter");
  const verifier = await AdapterFactory.deploy(withdrawVerifier.address);
  await verifier.deployed();
  console.log("✅ WithdrawVerifierAdapter deployed successfully:", verifier.address);

  // 3. Set 1inch Router address based on network
  console.log("\n📄 Setting 1inch Router address...");
  let oneInchRouterAddress: string;
  
  if (network.chainId === 42161) {
    // Arbitrum One mainnet
    oneInchRouterAddress = "0x111111125421cA6dc452d289314280a0f8842A65"; // 1inch Router V6
    console.log("🌐 Using Arbitrum mainnet 1inch Router V6");
  } else if (network.chainId === 1) {
    // Ethereum mainnet
    oneInchRouterAddress = "0x77340c866Ef1Da13407D61120010F136Fad5f91C"; // 1inch Router V6
    console.log("🌐 Using Ethereum mainnet 1inch Router V6");
  } else {
    throw new Error("Unsupported network, mainnet script only supports Arbitrum and Ethereum");
  }

  // 4. Deploy Iceberg (requires linking Poseidon library)
  console.log("\n📄 Deploying Iceberg...");
  const operator = deployer.address; // Set deployer as operator
  
  // Link Poseidon library
  const PoolFactory = await ethers.getContractFactory("Iceberg", {
    libraries: {
      PoseidonT3: poseidonT3Address,
    },
  });
  const pool = await PoolFactory.deploy(verifier.address, operator, oneInchRouterAddress);
  await pool.deployed();
  console.log("✅ Iceberg deployed successfully:", pool.address);

  // 5. Output important reminders
  console.log("\n💡 Important reminders:");
  console.log("📍 Current operator set to:", operator);
  console.log("📍 1inch Router integrated into Pool contract");
  console.log("📍 Pool contract can directly execute swap operations");
  console.log("💡 Please use addSwapConfig.ts script to add swap configurations");

  // 6. Verify deployment
  console.log("\n🔍 Verifying contract deployment...");
  const merkleRoot = await pool.getMerkleRoot();
  const nextConfigId = await pool.nextSwapConfigId();
  
  console.log("📊 Merkle Root:", merkleRoot);
  console.log("📊 Next config ID:", nextConfigId.toString());

  // 7. Output deployment summary
  console.log("\n🎉 Mainnet deployment completed! Contract address summary:");
  console.log("=" .repeat(60));
  console.log("PoseidonT3 Library:", poseidonT3Address);
  console.log("Groth16Verifier:", withdrawVerifier.address);
  console.log("WithdrawVerifierAdapter:", verifier.address);
  console.log("Iceberg:", pool.address);
  console.log("1inch Router:", oneInchRouterAddress);
  console.log("=" .repeat(60));

  // 8. Generate mainnet deployment config file
  const deploymentConfig = {
    network: network.name,
    chainId: network.chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    libraries: {
      PoseidonT3: poseidonT3Address
    },
    contracts: {
      Groth16Verifier: withdrawVerifier.address,
      WithdrawVerifierAdapter: verifier.address,
      Iceberg: pool.address,
      OneInchRouter: oneInchRouterAddress
    }
  };

  // Save config file
  const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
  fs.writeFileSync(configPath, JSON.stringify(deploymentConfig, null, 2));
  console.log("\n📄 Mainnet deployment config saved to:", configPath);
  
  // 9. Security checklist
  console.log("\n🔒 Post-deployment security checklist:");
  console.log("□ Verify all contract addresses on blockchain explorer");
  console.log("□ Check if contract source code is properly verified");
  console.log("□ Confirm operator address is set correctly");
  console.log("□ Test small transactions to ensure functionality is normal");
  console.log("□ Check if 1inch Router address is correct");
  console.log("□ Confirm ZK verifier is working properly");

  console.log("\n💡 Next steps:");
  console.log("1. Verify contract source code on blockchain explorer");
  console.log("2. Use addSwapConfig.ts to add swap configurations");
  console.log("3. Execute small test transactions");
  console.log("4. Configure monitoring and alerts");
  console.log("5. Prepare frontend integration");

  // return deploymentConfig;
}

// Error handling
main()
  .then(() => {
    console.log("✅ Mainnet deployment script executed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Mainnet deployment failed:", error);
    process.exit(1);
  });