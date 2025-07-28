/**
 * Deploy Poseidon library
 */

import { ethers } from "hardhat";
import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("🚀 Deploying Poseidon library...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deployer account:", deployer.address);
  console.log("💰 Account balance:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // Detect network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);

  // Deploy PoseidonT3 library
  const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.deployed();

  console.log("✅ PoseidonT3 library deployed to:", poseidonT3.address);
  
  // Save deployment info to JSON file
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    libraries: {
      PoseidonT3: poseidonT3.address
    }
  };

  const outputPath = path.join(__dirname, "../output/poseidon-libraries.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("📄 Deployment info saved to:", outputPath);
  console.log("\n🔗 Usage:");
  console.log("When deploying other contracts, need to link this library address");
  console.log("PoseidonT3:", poseidonT3.address);
  
  return {
    PoseidonT3: poseidonT3.address
  };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as deployPoseidon };