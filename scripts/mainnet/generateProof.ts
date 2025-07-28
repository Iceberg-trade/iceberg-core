/**
 * Real ZK proof generation script
 * Read nullifier and secret from mainnet-deposit-data.json, generate ZK proof for specified recipient address
 * Use refactored ZKProofGenerator class to simplify proof generation flow
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { ZKProofGenerator, CircuitInput } from "../../circuits/scripts/zkProof";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";
const { buildPoseidon } = require("circomlibjs");

async function main() {
  console.log("🔐 Generating real ZK proof...");

  // Detect network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: Currently not in mainnet environment");
  }

  // Get recipient address parameter - use USER_B's address as recipient
  const signers = await ethers.getSigners();
  
  if (signers.length < 2) {
    console.log("❌ Need at least 2 account configurations");
    console.log("Please ensure DEPLOYER_PRIVATE_KEY and USER_B_PRIVATE_KEY are configured in .env file");
    process.exit(1);
  }
  
  const userB = signers[1]; // Second account is USER_B
  const recipientAddress = userB.address;
  console.log("👮 Recipient address (USER_B):", recipientAddress)
  
  if (!recipientAddress) {
    console.log("❌ Must provide recipient address");
    console.log("Usage: npx hardhat run scripts/mainnet/generateProof.ts --network <network> -- <recipient_address>");
    process.exit(1);
  }

  // Validate recipient address format
  if (!ethers.utils.isAddress(recipientAddress)) {
    console.log("❌ Invalid recipient address:", recipientAddress);
    process.exit(1);
  }

  console.log("📮 Recipient address:", recipientAddress);

  // Read deposit data
  const dataPath = path.join(__dirname, "../output/mainnet-deposit-data.json");
  
  if (!fs.existsSync(dataPath)) {
    console.log("❌ Cannot find mainnet-deposit-data.json file");
    console.log("Please execute deposit.ts script first to generate deposit data");
    process.exit(1);
  }

  const depositData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  
  if (!depositData.swapExecuted) {
    console.log("❌ Swap not executed yet, please execute executeSwap.ts script first");
    process.exit(1);
  }

  console.log("📖 Reading deposit data:");
  console.log("  Nullifier:", depositData.nullifier);
  console.log("  Secret:", depositData.secret);

  // Read contract configuration
  const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const poolAddress = config.contracts.Iceberg;

  console.log("🏠 Contract address:", poolAddress);

  // Connect to contract to get current merkle root
  const pool = await ethers.getContractAt("Iceberg", poolAddress);
  const merkleRoot = await pool.getMerkleRoot();
  
  console.log("🌲 Current Merkle Root:", merkleRoot);

  try {
    // 1. Initialize ZK proof generator
    console.log("\n🔧 Initializing ZK proof generator...");
    const circuitsRoot = path.join(__dirname, "../../circuits");
    const zkProof = new ZKProofGenerator(circuitsRoot);
    
    // Show circuit info
    const circuitInfo = zkProof.getCircuitInfo();
    console.log(`📊 Circuit info: ${circuitInfo.circuitSize} constraints, using ${circuitInfo.powersOfTau}`);
    
    // 2. Build Poseidon hash function for verification
    console.log("\n🔧 Building Poseidon hash function for verification...");
    const poseidon = await buildPoseidon();
    
    // 3. Prepare input data
    const nullifier = BigInt(depositData.nullifier);
    const secret = BigInt(depositData.secret);
    const recipient = BigInt(recipientAddress);
    
    console.log("\n📋 Input parameters:");
    console.log("  Nullifier:", nullifier.toString());
    console.log("  Secret:", secret.toString());
    console.log("  Recipient:", recipient.toString());
    
    // 4. Verify hash calculation consistency
    const commitment = poseidon([nullifier, secret]);
    const nullifierHash = poseidon([nullifier]);
    
    const commitmentStr = poseidon.F.toString(commitment);
    const nullifierHashStr = poseidon.F.toString(nullifierHash);
    
    console.log("\n✅ Verifying hash calculation:");
    console.log("  Calculated Commitment:", commitmentStr);
    console.log("  Stored Commitment:", ethers.BigNumber.from(depositData.commitment).toString());
    console.log("  Calculated NullifierHash:", nullifierHashStr);
    console.log("  Stored NullifierHash:", ethers.BigNumber.from(depositData.nullifierHash).toString());
    
    // Verify consistency
    if (commitmentStr !== ethers.BigNumber.from(depositData.commitment).toString()) {
      throw new Error("Commitment calculation mismatch!");
    }
    if (nullifierHashStr !== ethers.BigNumber.from(depositData.nullifierHash).toString()) {
      throw new Error("NullifierHash calculation mismatch!");
    }
    console.log("  ✅ Hash verification passed");
    
    // 5. Get actual Merkle path
    console.log("\n🌲 Getting Merkle path...");
    
    const levels = 5; // Both circuit and contract use 5 levels
    console.log(`✅ Architecture consistent: ${levels}-level Merkle tree (supports ${2**levels} leaves)`);
    
    // Read tree-index data
    const treeIndexPath = path.join(__dirname, "../output/mainnet-tree-index.json");
    
    if (!fs.existsSync(treeIndexPath)) {
      console.log("❌ Cannot find mainnet-tree-index.json file");
      console.log("Please run first: npx hardhat run scripts/mainnet/findDepositEvent.ts --network arbitrum");
      process.exit(1);
    }
    
    const treeIndexData = JSON.parse(fs.readFileSync(treeIndexPath, "utf8"));
    
    // Verify commitment match
    if (treeIndexData.commitment !== depositData.commitment) {
      console.log("❌ Tree index data does not match deposit data");
      console.log("Deposit commitment:", depositData.commitment);
      console.log("Tree index commitment:", treeIndexData.commitment);
      process.exit(1);
    }
    
    const leafIndex = treeIndexData.leafIndex;
    console.log("📍 Commitment leaf index:", leafIndex);
    
    let pathElements: string[];
    let pathIndices: number[];
    
    try {
      // Get 5-level Merkle path from contract
      const merkleProof = await pool.getMerkleProof(leafIndex);
      pathElements = merkleProof[0].map((elem: any) => ethers.BigNumber.from(elem).toString());
      pathIndices = merkleProof[1].map((idx: any) => idx ? 1 : 0);
      
      console.log("✅ Successfully obtained actual Merkle path");
      console.log(`  PathElements count: ${pathElements.length}`);
      console.log(`  PathIndices count: ${pathIndices.length}`);
      
    } catch (error) {
      console.log("❌ Failed to get Merkle path:", getErrorMessage(error));
      throw new Error("Cannot get Merkle path, please check contract status and leafIndex");
    }
    
    // 6. Prepare circuit input (including public and private inputs)
    const circuitInput: CircuitInput = {
      // Public inputs
      merkleRoot: ethers.BigNumber.from(merkleRoot).toString(),
      nullifierHash: nullifierHashStr,
      recipient: recipient.toString(),
      // Private inputs
      nullifier: nullifier.toString(),
      secret: secret.toString(),
      pathElements: pathElements,
      pathIndices: pathIndices
    };
    
    console.log("\n📋 Circuit input validation:");
    console.log(`  PathElements count: ${pathElements.length} (should be ${levels})`);
    console.log(`  PathIndices count: ${pathIndices.length} (should be ${levels})`);
    
    // 7. Use ZKProofGenerator to generate proof
    console.log("\n🔐 Generating ZK proof...");
    const result = await zkProof.generateProof(circuitInput);
    
    console.log("  ✅ Proof generation successful!");
    console.log("  Public signals:", result.publicSignals);
    console.log(`  Proof saved in: ${result.runDirectory}`);
    
    // 8. Verify proof
    console.log("\n✅ Verifying proof...");
    const isValid = await zkProof.verifyProof(result.proof, result.publicSignals);
    
    if (!isValid) {
      throw new Error("Proof verification failed!");
    }
    
    // 9. Convert proof format to contract required format
    console.log("\n🔄 Converting proof format...");
    const formattedProof = zkProof.formatProofForContract(result.proof);
    
    // Convert to array format [a0, a1, b00, b01, b10, b11, c0, c1]
    const contractProof = [
      formattedProof.a[0],
      formattedProof.a[1],
      formattedProof.b[0][0],
      formattedProof.b[0][1],
      formattedProof.b[1][0],
      formattedProof.b[1][1],
      formattedProof.c[0],
      formattedProof.c[1]
    ];
    
    // 10. Save final proof file
    const finalProof = {
      type: "real",
      timestamp: new Date().toISOString(),
      recipient: recipientAddress,
      proof: contractProof,
      publicSignals: result.publicSignals,
      snarkjsProof: result.proof,
      runDirectory: result.runDirectory
    };
    
    const proofPath = path.join(__dirname, "../output/proof_mainnet.json");
    fs.writeFileSync(proofPath, JSON.stringify(finalProof, null, 2));
    
    console.log("\n🎉 Real ZK proof generation completed!");
    console.log("📄 Proof file saved to:", proofPath);
    
    console.log("\n📋 Proof data:");
    contractProof.forEach((p, i) => {
      console.log(`  Proof[${i}]: ${p}`);
    });
    
    console.log("\n🔗 Use proof for withdrawal:");
    console.log(`npx hardhat run scripts/mainnet/withdraw.ts --network arbitrum -- ${recipientAddress} ${proofPath}`);
    
    console.log("\n✅ Proof can be verified by on-chain verifier!");
    
  } catch (error) {
    console.error("❌ Proof generation failed:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "Required file not found")) {
      console.log("\n💡 Error tip - Please execute circuit setup in order:");
      console.log("1. cd circuits");
      console.log("2. ./scripts/setup-powersoftau.sh    # Generate Powers of Tau");
      console.log("3. ./scripts/compile.sh               # Compile circuit");
      console.log("4. ./scripts/generate-keys.sh         # Generate keys");
      console.log("5. ./scripts/test-proof.sh            # Test system");
    } else if (errorMessageIncludes(error, "WASM") || errorMessageIncludes(error, "witness")) {
      console.log("\n💡 Error tip:");
      console.log("1. Ensure circuit is compiled: cd circuits && ./scripts/compile.sh");
      console.log("2. Ensure keys are generated: cd circuits && ./scripts/generate-keys.sh");
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script execution failed:", error);
    process.exit(1);
  });