/**
 * mainnet deposit script
 * use wallet address A to deposit on mainnet
 * automatically read the first SwapConfig (or specified config ID) from the chain
 * ⚠️ warning: this will execute a real transaction on mainnet and consume real funds
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage, errorMessageIncludes } from "../utils/errorUtils";
const { poseidon2 } = require("poseidon-lite");

async function main() {
  console.log("💰 execute mainnet deposit...");

  // network security check
  const network = await ethers.provider.getNetwork();
  console.log("🌐 current network:", network.name, "Chain ID:", network.chainId);
  
  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ warning: current network is not mainnet");
    console.log("💡 suggest to use this script on mainnet");
  }

  // get account, use the first account as user A
  const signers = await ethers.getSigners();
  const userA = signers[0]; // the first account as user A
  console.log("👤 user A address:", userA.address);
  const balance = await userA.getBalance();
  console.log("💰 user A balance:", ethers.utils.formatEther(balance), "ETH");

  // balance check
  const minBalance = ethers.utils.parseEther("0.0002");
  if (balance.lt(minBalance)) {
    console.log("❌ balance is not enough, at least 0.0002 ETH is required for gas fee");
    process.exit(1);
  }

  // read contract address from deployment config file
  let poolAddress: string;
  let swapConfigId: string = "1"; // default to use the first config

  try {
    const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    poolAddress = config.contracts.Iceberg;
    console.log("📖 read contract address from deployment config file:", poolAddress);
  } catch (error) {
    console.log("❌ no mainnet-deployment.json config file found");
    console.log("please run deploy script first");
    process.exit(1);
  }

  // set token addresses according to network
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
    throw new Error("unsupported network, please run on Arbitrum or Ethereum mainnet");
  }

  // support command line argument to specify config ID
  const requestedConfigId = process.argv[2];
  if (requestedConfigId && !isNaN(parseInt(requestedConfigId))) {
    swapConfigId = requestedConfigId;
    console.log("✅ use specified config ID:", swapConfigId);
  } else {
    console.log("✅ use default config ID: 1 (the first config)");
  }

  try {
    // connect to Iceberg contract
    const pool = await ethers.getContractAt("Iceberg", poolAddress);

    // check if the config exists
    const nextConfigId = await pool.nextSwapConfigId();
    const totalConfigs = nextConfigId.toNumber() - 1;
    
    console.log("\n📊 on-chain SwapConfig status:");
    console.log(`📈 total configs: ${totalConfigs}`);
    
    if (totalConfigs === 0) {
      console.log("❌ no SwapConfig on chain");
      console.log("💡 please run addSwapConfig.ts first");
      process.exit(1);
    }

    // check if the requested config ID is valid
    const requestedId = parseInt(swapConfigId);
    if (requestedId < 1 || requestedId > totalConfigs) {
      console.log(`❌ config ID ${swapConfigId} is invalid, valid range: 1-${totalConfigs}`);
      console.log("💡 use default config ID: 1 (the first config)");
      swapConfigId = "1";
    }

    // get swap config
    const config = await pool.getSwapConfig(swapConfigId);
    
    // determine token name and decimals
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
      tokenName = "Unknown Token";
      decimals = 18;
    }

    console.log("\n📋 used SwapConfig:");
    console.log("  ConfigID:", swapConfigId);
    console.log("  TokenIn:", config.tokenIn === ethers.constants.AddressZero ? "ETH" : config.tokenIn);
    console.log("  TokenName:", tokenName);
    console.log("  FixedAmount:", ethers.utils.formatUnits(config.fixedAmount, decimals), tokenName);
    console.log("✅ config is valid, ready to deposit");

    // generate random nullifier and secret
    console.log("\n🔐 generate commitment data...");
    const nullifier = ethers.utils.randomBytes(31);
    const secret = ethers.utils.randomBytes(31);
    
    // calculate commitment = poseidon2(nullifier, secret)
    const commitment = poseidon2([
      ethers.BigNumber.from(nullifier).toString(),
      ethers.BigNumber.from(secret).toString()
    ]);
    const commitmentHex = "0x" + ethers.BigNumber.from(commitment.toString()).toHexString().slice(2).padStart(64, '0');

    console.log("🔑 generated data:");
    console.log("  Nullifier:", ethers.utils.hexlify(nullifier));
    console.log("  Secret:", ethers.utils.hexlify(secret));
    console.log("  Commitment:", commitmentHex);

    // save data to file for later use
    const depositData = {
      userA: userA.address,
      swapConfigId: swapConfigId,
      nullifier: ethers.utils.hexlify(nullifier),
      secret: ethers.utils.hexlify(secret),
      commitment: commitmentHex,
      timestamp: new Date().toISOString(),
      network: network.name,
      chainId: network.chainId,
      configInfo: {
        tokenName: tokenName,
        tokenIn: config.tokenIn,
        fixedAmount: config.fixedAmount.toString(),
        fixedAmountFormatted: ethers.utils.formatUnits(config.fixedAmount, decimals),
        decimals: decimals
      }
    };

    const dataPath = path.join(__dirname, "../output/mainnet-deposit-data.json");
    fs.writeFileSync(dataPath, JSON.stringify(depositData, null, 2));
    console.log("💾 mainnet data saved to:", dataPath);

    // Gas estimation and security confirmation
    console.log("\n⛽ estimate gas fee...");
    let gasEstimate, gasPrice;
    
    if (config.tokenIn === ethers.constants.AddressZero) {
      // ETH deposit
      gasEstimate = await pool.estimateGas.deposit(commitmentHex, swapConfigId, {
        value: config.fixedAmount
      });
    } else {
      // ERC20 deposit
      gasEstimate = await pool.estimateGas.deposit(commitmentHex, swapConfigId);
    }
    
    gasPrice = await ethers.provider.getGasPrice();
    const estimatedCost = gasEstimate.mul(gasPrice);
    
    console.log("⛽ estimated gas:", gasEstimate.toString());
    console.log("⛽ gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");
    console.log("⛽ estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");

    // security confirmation
    console.log("\n🔒 security confirmation:");
    console.log("📍 network:", network.name);
    console.log("💰 deposit amount:", ethers.utils.formatUnits(
      config.fixedAmount, 
      config.tokenIn === ethers.constants.AddressZero ? 18 : 6
    ), config.tokenIn === ethers.constants.AddressZero ? "ETH" : "Token");
    console.log("⛽ estimated cost:", ethers.utils.formatEther(estimatedCost), "ETH");
    console.log("\n⚠️ this is a real transaction on mainnet, will consume real funds!");
    console.log("✅ please confirm all information is correct");

    // execute deposit
    console.log("\n💸 execute mainnet deposit transaction...");
    
    let tx;
    if (config.tokenIn === ethers.constants.AddressZero) {
      // ETH deposit
      tx = await pool.connect(userA).deposit(commitmentHex, swapConfigId, {
        value: config.fixedAmount
      });
    } else {
      // ERC20 deposit - need to approve first
      const token = await ethers.getContractAt("IERC20", config.tokenIn);
      
      console.log("🔓 execute token approve...");
      const approveTx = await token.connect(userA).approve(poolAddress, config.fixedAmount);
      await approveTx.wait();
      console.log("✅ approve completed");

      tx = await pool.connect(userA).deposit(commitmentHex, swapConfigId);
    }

    console.log("⏳ wait for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("✅ deposit completed!");
    console.log("📄 transaction hash:", receipt.transactionHash);
    console.log("⛽ gas used:", receipt.gasUsed.toString());

    // check event
    const depositEvent = receipt.events?.find((e: any) => e.event === "Deposit");
    if (depositEvent) {
      console.log("📊 deposit event:");
      console.log("  Commitment:", depositEvent.args.commitment);
      console.log("  LeafIndex:", depositEvent.args.leafIndex.toString());
      console.log("  SwapConfigId:", depositEvent.args.swapConfigId.toString());
    }

    // check merkle tree status
    const merkleRoot = await pool.getMerkleRoot();
    console.log("🌲 updated Merkle Root:", merkleRoot);

    console.log("\n🎉 deposit completed!");
    console.log("💡 user A has successfully deposited funds, can continue to execute swap operation");
    
    // show next operation suggestion
    console.log("\n📋 next operation:");
    console.log("1. execute swap: npx hardhat run scripts/mainnet/executeSwap.ts --network arbitrum");
    console.log("2. execute withdraw: npx hardhat run scripts/mainnet/withdraw.ts --network arbitrum");
    console.log("\n💡 tips:");
    console.log("- executeSwap.ts will read the deposit data and automatically select the appropriate output token");
    console.log("- withdraw.ts will read the swap result and extract to a new address");
    console.log("\n📊 config summary:");
    console.log(`- deposit amount: ${ethers.utils.formatUnits(config.fixedAmount, decimals)} ${tokenName}`);
    console.log(`- config ID: ${swapConfigId}`);
    console.log(`- user address: ${userA.address}`);

  } catch (error) {
    console.error("❌ deposit failed:", getErrorMessage(error));
    
    if (errorMessageIncludes(error, "Invalid ETH amount")) {
      console.log("\n💡 error reason: ETH amount is incorrect");
      console.log("please check the fixed amount of the swap config");
    } else if (errorMessageIncludes(error, "ERC20: insufficient allowance")) {
      console.log("\n💡 error reason: token allowance is insufficient");
      console.log("please ensure the user has enough token balance");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ script execution failed:", error);
    process.exit(1);
  });