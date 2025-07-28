import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";

async function main() {
  console.log("💸 Executing mainnet user withdrawal...");

  // Network security check
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);
  
  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: Currently not in mainnet environment");
    console.log("💡 Recommend using this script in mainnet environment");
  }

  // Use USER_B_PRIVATE_KEY as withdrawal transaction sender
  const userBPrivateKey = process.env.USER_B_PRIVATE_KEY;
  if (!userBPrivateKey) {
    console.log("❌ USER_B_PRIVATE_KEY environment variable not found");
    console.log("Please set USER_B_PRIVATE_KEY in .env file");
    process.exit(1);
  }
  
  const userB = new ethers.Wallet(userBPrivateKey, ethers.provider);
  console.log("👤 User B address:", userB.address);
  const balance = await userB.getBalance();
  console.log("💰 User B balance:", ethers.utils.formatEther(balance), "ETH");

  // Balance check
  const minBalance = ethers.utils.parseEther("0.0002");
  if (balance.lt(minBalance)) {
    console.log("❌ Insufficient balance, at least 0.0002 ETH required for gas fees");
    process.exit(1);
  }

  // Use user B's address as recipient address, proof file path hardcoded
  const recipientAddress = userB.address; // Use user B address as recipient address
  const proofFilePath = path.join(__dirname, "../output/proof_mainnet.json"); // Hardcoded proof file path
  let poolAddress: string;

  console.log("📮 Recipient address will be set to user B address:", recipientAddress);
  console.log("📁 Proof file path:", proofFilePath);

  try {
    const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    poolAddress = config.contracts.Iceberg;
    console.log("📖 Reading contract address from config file:", poolAddress);
  } catch (error) {
    console.log("❌ Config file mainnet-deployment.json not found");
    console.log("Please ensure deploy.ts script has been executed to generate config file");
    process.exit(1);
  }

  console.log("🏠 Contract address:", poolAddress);

  try {
    // Read deposit and swap data
    const dataPath = path.join(__dirname, "../output/mainnet-deposit-data.json");
    
    if (!fs.existsSync(dataPath)) {
      throw new Error("Cannot find mainnet-deposit-data.json file, please execute deposit.ts and executeSwap.ts scripts first");
    }

    const depositData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    
    if (!depositData.swapExecuted) {
      throw new Error("Swap not executed yet, please execute executeSwap.ts script first");
    }

    if (depositData.withdrawExecuted) {
      console.log("⚠️ Funds already withdrawn, no need to repeat operation");
      console.log("📄 Previous withdrawal data:", depositData);
      return;
    }

    console.log("📖 Reading Swap data:");
    console.log("  User A:", depositData.userA || depositData.userB); // Compatible with old data
    console.log("  SwapConfigId:", depositData.swapConfigId);
    console.log("  NullifierHash:", depositData.nullifierHash);
    console.log("  TokenOut:", depositData.tokenOut);
    console.log("  SwapOutput:", depositData.swapOutput);
    console.log("  Network:", depositData.network);
    
    if (depositData.configInfo) {
      console.log("  Config info:", `${depositData.configInfo.fixedAmountFormatted} ${depositData.configInfo.tokenName}`);
    }

    // Connect to Iceberg contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // Check swap status
    const swapResult = await pool.getSwapResult(depositData.nullifierHash);
    if (ethers.BigNumber.from(swapResult.amount).eq(0)) {
      throw new Error("No amount available for withdrawal, swap may not be executed or already withdrawn");
    }

    const tokenOut = swapResult.tokenOut;
    const amount = swapResult.amount;
    
    console.log("💰 Withdrawable info:");
    console.log("  TokenOut:", tokenOut === ethers.constants.AddressZero ? "ETH" : tokenOut);
    console.log("  Amount:", ethers.utils.formatUnits(
      amount,
      tokenOut === ethers.constants.AddressZero ? 18 : 6
    ), tokenOut === ethers.constants.AddressZero ? "ETH" : "Token");

    // Read ZK proof file
    console.log("\n🔐 Reading ZK proof...");
    
    let proof: string[];
    let proofData: any;
    
    // Use hardcoded proof file path
    const proofPath = proofFilePath;
    
    // Check if proof file exists
    if (!fs.existsSync(proofPath)) {
      console.log("❌ Proof file does not exist:", proofPath);
      console.log("\n💡 Please follow these steps to generate proof:");
      console.log("1. Ensure deposit.ts and executeSwap.ts have been executed");
      console.log("2. Run proof generation script:");
      console.log(`   npx hardhat run scripts/mainnet/generateProof.ts --network ${network.name}`);
      console.log("3. Then run this script:");
      console.log(`   npx hardhat run scripts/mainnet/withdraw.ts --network ${network.name}`);
      process.exit(1);
    }
    
    try {
      // Read proof file
      proofData = JSON.parse(fs.readFileSync(proofPath, "utf8"));
      
      // Validate proof file format
      if (!proofData.proof || !proofData.type || proofData.type !== "real") {
        throw new Error("Invalid proof file format, must contain proof and type='real' fields");
      }
      
      proof = proofData.proof;
      
      // Validate if recipient address matches
      if (proofData.recipient && proofData.recipient !== recipientAddress) {
        console.log("⚠️ Warning: Recipient address in proof file does not match user B address");
        console.log("  Address in proof file:", proofData.recipient);
        console.log("  User B address:", recipientAddress);
        console.log("  Will use user B address for withdrawal");
      }
      
      console.log("✅ Proof file read successfully");
      console.log("📊 Proof info:");
      console.log("  Type:", proofData.type);
      console.log("  Generated time:", proofData.timestamp);
      console.log("  Recipient address:", proofData.recipient);
      if (proofData.runDirectory) {
        console.log("  Run directory:", proofData.runDirectory);
      }
      if (proofData.publicSignals) {
        console.log("  Public signals count:", proofData.publicSignals.length);
      }
      
    } catch (error) {
      console.log("❌ Cannot read or parse proof file:", getErrorMessage(error));
      console.log("\n💡 Please ensure:");
      console.log("1. Proof file exists and format is correct");
      console.log("2. Proof is generated through generateProof.ts script");
      console.log("3. Proof file contains correct data structure");
      process.exit(1);
    }
    
    // Validate proof format
    if (!Array.isArray(proof) || proof.length !== 8) {
      throw new Error("ZK proof format error, must be an array containing 8 elements");
    }
    
    // Validate each proof element is a valid number string and convert to BigNumber
    const proofBigNumbers: ethers.BigNumber[] = [];
    proof.forEach((p, i) => {
      try {
        // Try to convert string to BigNumber
        const bn = ethers.BigNumber.from(p.toString());
        proofBigNumbers.push(bn);
      } catch (error) {
        throw new Error(`Proof element ${i} format error, cannot convert to number: ${p}`);
      }
    });

    console.log("✅ ZK proof format validation passed, converted to BigNumber format");
    
    // Display proof details
    console.log("\n📋 Proof details:");
    proofBigNumbers.forEach((p, i) => {
      const labels = ["a[0]", "a[1]", "b[0][0]", "b[0][1]", "b[1][0]", "b[1][1]", "c[0]", "c[1]"];
      console.log(`  ${labels[i]}: ${p.toString()}`);
    });

    // Gas estimation
    console.log("\n⛽ Estimating Gas fees...");
    const gasEstimate = await pool.estimateGas.withdraw(
      depositData.nullifierHash,
      recipientAddress,
      proofBigNumbers
    );
    const gasPrice = await ethers.provider.getGasPrice();
    const estimatedCost = gasEstimate.mul(gasPrice);
    
    console.log("⛽ Estimated Gas:", gasEstimate.toString());
    console.log("⛽ Gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");
    console.log("⛽ Estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");

    // Security confirmation
    console.log("\n🔒 Security confirmation:");
    console.log("📍 Network:", network.name);
    console.log("🔑 NullifierHash:", depositData.nullifierHash);
    console.log("📮 Recipient address:", recipientAddress);
    console.log("💰 Withdrawal amount:", ethers.utils.formatUnits(
      amount,
      tokenOut === ethers.constants.AddressZero ? 18 : 6
    ), tokenOut === ethers.constants.AddressZero ? "ETH" : "Token");
    console.log("⛽ Estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");
    console.log("\n⚠️ This is a mainnet real transaction, will consume real funds!");
    console.log("✅ Please confirm all information is correct");

    // Execute withdrawal
    console.log("\n💸 Executing mainnet withdrawal transaction...");
    
    const tx = await pool.connect(userB).withdraw(
      depositData.nullifierHash,
      recipientAddress,
      proofBigNumbers,
      {
        gasLimit: gasEstimate.mul(110).div(100) // Give 10% buffer
      }
    );

    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Withdrawal successful!");
    console.log("📄 Transaction hash:", receipt.transactionHash);
    console.log("⛽ Gas used:", receipt.gasUsed.toString());
    console.log("🌐 Block explorer:", `https://${network.chainId === 42161 ? 'arbiscan.io' : 'etherscan.io'}/tx/${receipt.transactionHash}`);

    // Check events
    const withdrawEvent = receipt.events?.find(e => e.event === "Withdrawal");
    if (withdrawEvent) {
      console.log("📊 Withdrawal event:");
      console.log("  NullifierHash:", withdrawEvent.args.nullifierHash);
      console.log("  Recipient:", withdrawEvent.args.recipient);
      console.log("  TokenOut:", withdrawEvent.args.tokenOut);
      console.log("  Amount:", ethers.utils.formatUnits(
        withdrawEvent.args.amount,
        tokenOut === ethers.constants.AddressZero ? 18 : 6
      ), tokenOut === ethers.constants.AddressZero ? "ETH" : "Token");
    }

    // Check recipient address balance change
    if (tokenOut === ethers.constants.AddressZero) {
      // ETH
      const newBalance = await ethers.provider.getBalance(recipientAddress);
      console.log("💰 Recipient address new ETH balance:", ethers.utils.formatEther(newBalance), "ETH");
    } else {
      // ERC20 token
      const tokenContract = await ethers.getContractAt("IERC20", tokenOut);
      const newBalance = await tokenContract.balanceOf(recipientAddress);
      console.log("💰 Recipient address new Token balance:", ethers.utils.formatUnits(newBalance, 6), "Token");
    }

    // Verify post-withdrawal status
    const remainingSwapResult = await pool.getSwapResult(depositData.nullifierHash);
    console.log("📊 Remaining withdrawable amount:", ethers.utils.formatUnits(
      remainingSwapResult.amount,
      tokenOut === ethers.constants.AddressZero ? 18 : 6
    ), tokenOut === ethers.constants.AddressZero ? "ETH" : "Token");

    // Update data file
    depositData.withdrawExecuted = true;
    depositData.recipient = recipientAddress;
    depositData.withdrawTimestamp = new Date().toISOString();
    depositData.withdrawTransactionHash = receipt.transactionHash;
    depositData.withdrawGasUsed = receipt.gasUsed.toString();
    depositData.proofFile = proofPath;
    if (proofData.runDirectory) {
      depositData.proofRunDirectory = proofData.runDirectory;
    }
    
    fs.writeFileSync(dataPath, JSON.stringify(depositData, null, 2));
    console.log("💾 Mainnet withdrawal data updated to:", dataPath);

    console.log("\n🎉 Complete mainnet anonymous swap flow execution completed!");
    console.log("✅ User B has successfully withdrawn funds to new address");
    console.log("🔒 Privacy protected: deposit address and withdrawal address are separated");
    console.log("🔗 Transaction link:", `https://${network.chainId === 42161 ? 'arbiscan.io' : 'etherscan.io'}/tx/${receipt.transactionHash}`);

  } catch (error) {
    console.error("❌ Withdrawal failed:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "Invalid proof")) {
      console.log("\n💡 Error reason: Invalid ZK proof");
      console.log("Please check if proof data is correct, ensure:");
      console.log("- Proof is generated for correct nullifier and recipient");
      console.log("- Proof data format is correct");
      console.log("- Merkle tree state is consistent with proof generation time");
    } else if (errorMessageIncludes(error, "No swapped amount available")) {
      console.log("\n💡 Error reason: No amount available for withdrawal");
      console.log("Please ensure swap has been executed and not withdrawn");
    } else if (errorMessageIncludes(error, "insufficient funds")) {
      console.log("\n💡 Error reason: Insufficient account balance");
      console.log("Please ensure account has enough ETH to pay gas fees");
    } else if (errorMessageIncludes(error, "Proof file does not exist")) {
      console.log("\n💡 Error reason: Missing ZK proof file");
      console.log("Please run proof generation script first:");
      console.log(`npx hardhat run scripts/mainnet/generateProof.ts --network ${network.name}`);
    } else if (errorMessageIncludes(error, "Invalid proof file format")) {
      console.log("\n💡 Error reason: Invalid proof file format");
      console.log("Please ensure using correct generateProof.ts script to generate proof file");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script execution failed:", error);
    process.exit(1);
  });