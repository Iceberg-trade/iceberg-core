/**
 * Mainnet Swap execution script
 * Uses wallet address A (deployer) to execute swap operations on mainnet through Iceberg
 * ⚠️ Warning: This will execute real transactions on mainnet and consume real funds
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
const { poseidon1 } = require("poseidon-lite");
import { getSwapTransaction } from "../utils/1inchApi";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";

async function main() {
  console.log("🔄 Executing mainnet Swap operations...");

  // Network security check
  const network = await ethers.provider.getNetwork();
  console.log("🌐 Current network:", network.name, "Chain ID:", network.chainId);
  
  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ Warning: Not currently on mainnet environment");
    console.log("💡 Recommend using this script in mainnet environment");
  }

  // Get deployer account (Pool's operator)
  const [deployer] = await ethers.getSigners();
  console.log("👮 Deployer address:", deployer.address);
  const balance = await deployer.getBalance();
  console.log("💰 Deployer balance:", ethers.utils.formatEther(balance), "ETH");

  // Balance check
  const minBalance = ethers.utils.parseEther("0.001");
  if (balance.lt(minBalance)) {
    console.log("❌ Insufficient balance, at least 0.001 ETH needed for gas fees");
    process.exit(1);
  }

  // Get contract address from config file
  let poolAddress: string;

  try {
    const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    poolAddress = config.contracts.Iceberg;
    console.log("📖 Reading contract address from config file");
    console.log("🏠 Iceberg:", poolAddress);
  } catch (error) {
    console.log("❌ mainnet-deployment.json config file not found");
    console.log("Please execute deployment script first");
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
  } else if (network.chainId === 1) {
    // Ethereum mainnet token addresses
    usdcAddress = "0xA0b86a33E6441B8d08A88C57226F14B1ead5BeF3"; // USDC on Ethereum
    usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT on Ethereum
    wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH on Ethereum
  } else {
    throw new Error("Unsupported network, please run on Arbitrum or Ethereum mainnet");
  }

  try {
    // Read deposit data
    const dataPath = path.join(__dirname, "../output/mainnet-deposit-data.json");
    
    if (!fs.existsSync(dataPath)) {
      throw new Error("Cannot find mainnet-deposit-data.json file, please execute deposit.ts script first");
    }

    const depositData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    
    if (depositData.swapExecuted) {
      console.log("⚠️ Swap already executed, no need to repeat operation");
      console.log("📄 Previous transaction data:", depositData);
      return;
    }

    console.log("📖 Read deposit data:");
    console.log("  UserA:", depositData.userA);
    console.log("  SwapConfigId:", depositData.swapConfigId);
    console.log("  Commitment:", depositData.commitment);
    console.log("  Network:", depositData.network);
    console.log("  Config info:", `${depositData.configInfo.fixedAmountFormatted} ${depositData.configInfo.tokenName}`);
    
    // Verify necessary data
    if (!depositData.configInfo) {
      throw new Error("Deposit data missing config info, please re-execute deposit.ts script");
    }

    // 计算nullifierHash = poseidon1(nullifier)
    const nullifierHash = poseidon1([ethers.BigNumber.from(depositData.nullifier).toString()]);
    const nullifierHashHex = "0x" + ethers.BigNumber.from(nullifierHash.toString()).toHexString().slice(2).padStart(64, '0');
    console.log("🔑 Calculated NullifierHash:", nullifierHashHex);

    // Connect to contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // Get swap config and verify consistency with deposit data
    const config = await pool.getSwapConfig(depositData.swapConfigId);
    console.log("\n📋 On-chain Swap config verification:");
    console.log("  TokenIn:", config.tokenIn === ethers.constants.AddressZero ? "ETH" : config.tokenIn);
    console.log("  FixedAmount:", ethers.utils.formatUnits(
      config.fixedAmount, 
      depositData.configInfo.decimals
    ), depositData.configInfo.tokenName);

    // Verify config consistency
    if (config.tokenIn !== depositData.configInfo.tokenIn) {
      throw new Error("On-chain config inconsistent with deposit data");
    }
    if (!config.fixedAmount.eq(depositData.configInfo.fixedAmount)) {
      throw new Error("On-chain fixed amount inconsistent with deposit data");
    }
    console.log("✅ Config verification passed");

    // Smart selection of output token (based on config info in deposit data)
    let tokenOut: string;
    const tokenIn = depositData.configInfo.tokenIn;
    const tokenName = depositData.configInfo.tokenName;
    
    if (tokenIn === ethers.constants.AddressZero) {
      // ETH input, default output USDC
      tokenOut = usdcAddress;
      console.log("  TokenOut (smart selection):", tokenOut, "(USDC)");
    } else if (tokenName === "USDC") {
      // USDC input, output ETH
      tokenOut = ethers.constants.AddressZero;
      console.log("  TokenOut (smart selection): ETH");
    } else if (tokenName === "USDT") {
      // USDT input, output ETH
      tokenOut = ethers.constants.AddressZero;
      console.log("  TokenOut (smart selection): ETH");
    } else {
      // Other token input, default output ETH
      tokenOut = ethers.constants.AddressZero;
      console.log("  TokenOut (smart selection): ETH");
    }

    // Check if nullifierHash has been used
    const isUsed = await pool.nullifierHashUsed(nullifierHashHex);
    if (isUsed) {
      throw new Error("NullifierHash already used, cannot repeat swap");
    }

    // Use 1inch API to get real swap data
    console.log("\n🔄 Getting 1inch real quotes...");
    
    const swapParams = {
      chainId: network.chainId,
      src: tokenIn,
      dst: tokenOut,
      amount: config.fixedAmount.toString(),
      from: poolAddress, // Iceberg作为调用者
      slippage: 1, // 1%滑点
      disableEstimate: true
    };

    // Get 1inch real transaction data (must succeed, otherwise exit)
    console.log("🔄 Getting 1inch transaction data...");
    const swapData = await getSwapTransaction(swapParams);
    const abi = [
      "function swap(address executor, tuple(address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags) desc, bytes data)"
    ];
    const iface = new ethers.utils.Interface(abi);
    const parsed = iface.parseTransaction({ data: swapData.tx.data });
    const executor = parsed.args[0];
    const desc = parsed.args[1];
    const innerData = parsed.args[2]; // ✅ 真正要传进合约的 data 参数
    const expectedOutput = ethers.BigNumber.from(swapData.dstAmount)

    // Gas estimation
    console.log("\n⛽ Estimating Gas fees...");
    const gasEstimate = await pool.estimateGas.executeSwap(
      nullifierHashHex, 
      depositData.swapConfigId,
      tokenOut,
      executor,
      desc,
      innerData,
    );
    const gasPrice = await ethers.provider.getGasPrice();
    const estimatedCost = gasEstimate.mul(gasPrice);
    
    console.log("⛽ Estimated Gas:", gasEstimate.toString());
    console.log("⛽ Gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");
    console.log("⛽ Estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");

    // Security confirmation
    console.log("\n🔒 Security confirmation:");
    console.log("📍 Network:", network.name);
    console.log("🔑 NullifierHash:", nullifierHashHex);
    console.log("🎯 TokenOut:", tokenOut === ethers.constants.AddressZero ? "ETH" : tokenOut);
    console.log("💱 Estimated output:", ethers.utils.formatUnits(
      expectedOutput,
      tokenOut === ethers.constants.AddressZero ? 18 : 6
    ), tokenOut === ethers.constants.AddressZero ? "ETH" : "Token");
    console.log("⛽ Estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");
    console.log("\n⚠️ This is a real mainnet transaction, will consume real funds!");
    console.log("✅ Please confirm all information is correct");

    // Execute swap through Iceberg
    console.log("\n🔄 Executing mainnet Swap...");
    const tx = await pool.connect(deployer).executeSwap(
      nullifierHashHex, 
      depositData.swapConfigId,
      tokenOut,
      executor,
      desc,
      innerData,
    );
    
    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("✅ Swap recorded successfully!");
    console.log("📄 Transaction hash:", receipt.transactionHash);
    console.log("⛽ Gas used:", receipt.gasUsed.toString());
    console.log("🌐 Block explorer:", `https://${network.chainId === 42161 ? 'arbiscan.io' : 'etherscan.io'}/tx/${receipt.transactionHash}`);

    // Check events
    const swapEvent = receipt.events?.find((e: any) => e.event === "SwapResultRecorded");
    if (swapEvent) {
      console.log("📊 Swap record event:");
      console.log("  NullifierHash:", swapEvent.args.nullifierHash);
      console.log("  TokenOut:", swapEvent.args.tokenOut);
      console.log("  AmountOut:", ethers.utils.formatUnits(
        swapEvent.args.amountOut,
        tokenOut === ethers.constants.AddressZero ? 18 : 6
      ));
    }

    // Verify swap status
    const swapResult = await pool.getSwapResult(nullifierHashHex);
    const nullifierUsed = await pool.nullifierHashUsed(nullifierHashHex);
    
    console.log("\n📊 Swap status verification:");
    console.log("  TokenOut:", swapResult.tokenOut);
    console.log("  Amount:", ethers.utils.formatUnits(
      swapResult.amount,
      tokenOut === ethers.constants.AddressZero ? 18 : 6
    ));
    console.log("  NullifierUsed:", nullifierUsed);

    // Update deposit data file, add swap info
    depositData.swapExecuted = true;
    depositData.nullifierHash = nullifierHashHex;
    depositData.tokenOut = tokenOut;
    depositData.swapOutput = swapResult.amount.toString();
    depositData.swapTimestamp = new Date().toISOString();
    depositData.transactionHash = receipt.transactionHash;
    depositData.gasUsed = receipt.gasUsed.toString();
    
    fs.writeFileSync(dataPath, JSON.stringify(depositData, null, 2));
    console.log("💾 Mainnet Swap data updated to:", dataPath);

    console.log("\n🎉 Mainnet Swap execution completed!");
    console.log("💡 Now user A can use withdraw.ts script to extract funds");
    console.log("🔗 Transaction link:", `https://${network.chainId === 42161 ? 'arbiscan.io' : 'etherscan.io'}/tx/${receipt.transactionHash}`);

  } catch (error) {
    console.error("❌ Swap execution failed:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "1inch API错误")) {
      console.log("\n💡 1inch API error reasons:");
      console.log("- Check network connection and API availability");
      console.log("- Verify token addresses are correct");
      console.log("- Confirm transaction amounts are reasonable");
      console.log("- Check if liquidity is sufficient");
      console.log("- Try adjusting slippage settings");
    } else if (errorMessageIncludes(error, "无效的executor地址")) {
      console.log("\n💡 Error reason: Invalid executor address returned by 1inch");
      console.log("Please check 1inch API response data");
    } else if (errorMessageIncludes(error, "无效的1inch交易数据")) {
      console.log("\n💡 Error reason: Invalid 1inch transaction data returned");
      console.log("Please check 1inch API response data");
    } else if (errorMessageIncludes(error, "Only operator can call this function")) {
      console.log("\n💡 Error reason: Only Pool's operator can execute this operation");
      console.log("Please ensure using account set as operator");
    } else if (errorMessageIncludes(error, "Nullifier already used")) {
      console.log("\n💡 Error reason: NullifierHash already used");
      console.log("Each nullifier can only be used once");
    } else if (errorMessageIncludes(error, "insufficient funds")) {
      console.log("\n💡 Error reason: Insufficient account balance");
      console.log("Please ensure account has sufficient ETH to pay gas fees");
    }
    
    console.log("\n🛠️ Troubleshooting suggestions:");
    console.log("1. Check network connection and 1inch API status");
    console.log("2. Verify all token addresses and configurations");
    console.log("3. Confirm account balance is sufficient");
    console.log("4. Check market liquidity situation");
    console.log("5. If necessary, please intervene manually");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script execution failed:", error);
    process.exit(1);
  });