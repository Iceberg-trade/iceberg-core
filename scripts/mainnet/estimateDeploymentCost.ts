/**
 * mainnet deployment cost estimation script
 * estimate the required ETH cost before actual deployment
 * ⚠️ only for cost estimation, will not actually deploy contracts
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage } from "../utils/errorUtils";

async function main() {
  console.log("💰 start estimating mainnet deployment cost...");

  // get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 deployer account:", deployer.address);
  
  const balance = await deployer.getBalance();
  console.log("💰 current balance:", ethers.utils.formatEther(balance), "ETH");

  // check network
  const network = await ethers.provider.getNetwork();
  console.log("🌐 current network:", network.name, "Chain ID:", network.chainId);

  if (network.chainId !== 42161 && network.chainId !== 1) {
    console.log("⚠️ warning: it is recommended to run this estimation in mainnet environment for accurate results");
  }

  // get current gas price
  const gasPrice = await ethers.provider.getGasPrice();
  console.log("⛽ current gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");

  let totalEstimatedGas = ethers.BigNumber.from(0);
  let totalEstimatedCost = ethers.BigNumber.from(0);

  console.log("\n📊 contract deployment cost estimation:");
  console.log("=" .repeat(80));

  const contractEstimates = [];

  // 1. WithdrawVerifier
  console.log("\n🔍 estimate WithdrawVerifier:");
  try {
    const VerifierFactory = await ethers.getContractFactory("WithdrawVerifier");
    const bytecode = VerifierFactory.bytecode;
    const bytecodeSize = ethers.utils.hexDataLength(bytecode);
    
    const deployTransaction = VerifierFactory.getDeployTransaction();
    const verifierGas = await ethers.provider.estimateGas(deployTransaction);
    const verifierCost = verifierGas.mul(gasPrice);
    
    console.log("  📦 bytecode size:", bytecodeSize.toLocaleString(), "bytes");
    console.log("  ⛽ estimated gas:", verifierGas.toLocaleString());
    console.log("  💰 estimated cost:", ethers.utils.formatEther(verifierCost), "ETH");
    
    // add to summary
    contractEstimates.push({
      name: "WithdrawVerifier",
      bytecodeSize,
      gasEstimate: verifierGas,
      costEstimate: verifierCost,
      costETH: ethers.utils.formatEther(verifierCost)
    });
    
    totalEstimatedGas = totalEstimatedGas.add(verifierGas);
    totalEstimatedCost = totalEstimatedCost.add(verifierCost);
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.log("  ❌ estimate failed:", errorMsg);
    contractEstimates.push({
      name: "WithdrawVerifier",
      error: errorMsg
    });
  }

  // 2. WithdrawVerifierAdapter
  console.log("\n🔍 estimate WithdrawVerifierAdapter:");
  try {
    const AdapterFactory = await ethers.getContractFactory("WithdrawVerifierAdapter");
    const bytecode = AdapterFactory.bytecode;
    const bytecodeSize = ethers.utils.hexDataLength(bytecode);
    
    const deployTransaction = AdapterFactory.getDeployTransaction(ethers.constants.AddressZero);
    const adapterGas = await ethers.provider.estimateGas(deployTransaction);
    const adapterCost = adapterGas.mul(gasPrice);
    
    console.log("  📦 bytecode size:", bytecodeSize.toLocaleString(), "bytes");
    console.log("  ⛽ estimated gas:", adapterGas.toLocaleString());
    console.log("  💰 estimated cost:", ethers.utils.formatEther(adapterCost), "ETH");
    
    contractEstimates.push({
      name: "WithdrawVerifierAdapter",
      bytecodeSize,
      gasEstimate: adapterGas,
      costEstimate: adapterCost,
      costETH: ethers.utils.formatEther(adapterCost)
    });
    
    totalEstimatedGas = totalEstimatedGas.add(adapterGas);
    totalEstimatedCost = totalEstimatedCost.add(adapterCost);
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.log("  ❌ estimate failed:", errorMsg);
    contractEstimates.push({
      name: "WithdrawVerifierAdapter",
      error: errorMsg
    });
  }

  // 3. Iceberg
  console.log("\n🔍 estimate Iceberg:");
  try {
    const PoolFactory = await ethers.getContractFactory("Iceberg");
    const bytecode = PoolFactory.bytecode;
    const bytecodeSize = ethers.utils.hexDataLength(bytecode);
    
    // set 1inch Router address based on network
    let oneInchRouterAddress = "0x111111125421cA6dc452d289314280a0f8842A65"; // Arbitrum default
    if (network.chainId === 1) {
      oneInchRouterAddress = "0x77340c866Ef1Da13407D61120010F136Fad5f91C"; // Ethereum
    }
    
    const deployTransaction = PoolFactory.getDeployTransaction(
      ethers.constants.AddressZero, // verifier placeholder
      deployer.address, // operator
      oneInchRouterAddress // 1inch router
    );
    const poolGas = await ethers.provider.estimateGas(deployTransaction);
    const poolCost = poolGas.mul(gasPrice);
    
    console.log("  📦 bytecode size:", bytecodeSize.toLocaleString(), "bytes");
    console.log("  ⛽ estimated gas:", poolGas.toLocaleString());
    console.log("  💰 estimated cost:", ethers.utils.formatEther(poolCost), "ETH");
    
    contractEstimates.push({
      name: "Iceberg",
      bytecodeSize,
      gasEstimate: poolGas,
      costEstimate: poolCost,
      costETH: ethers.utils.formatEther(poolCost)
    });
    
    totalEstimatedGas = totalEstimatedGas.add(poolGas);
    totalEstimatedCost = totalEstimatedCost.add(poolCost);
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.log("  ❌ estimate failed:", errorMsg);
    contractEstimates.push({
      name: "Iceberg",
      error: errorMsg
    });
  }


  // detailed cost summary table
  console.log("\n" + "=" .repeat(90));
  console.log("📊 detailed cost summary table:");
  console.log("-".repeat(90));
  console.log("contract name".padEnd(25) + "bytecode (bytes)".padEnd(15) + "gas consumption".padEnd(15) + "ETH cost".padEnd(15) + "percentage");
  console.log("-".repeat(90));
  
  for (const estimate of contractEstimates) {
    if (estimate.error) {
      console.log(estimate.name.padEnd(25) + "❌ estimate failed".padEnd(45) + estimate.error);
    } else {
      const percentage = totalEstimatedCost.gt(0) 
        ? ((estimate.gasEstimate ? estimate.gasEstimate.toNumber() : 0 / totalEstimatedGas.toNumber()) * 100).toFixed(1) + "%"
        : "0%";
      
      console.log(
        estimate.name.padEnd(25) +
        (estimate.bytecodeSize ? estimate.bytecodeSize.toLocaleString() : "0").padEnd(15) +
        (estimate.gasEstimate ? estimate.gasEstimate.toLocaleString() : "0").padEnd(15) +
        (estimate.costETH ? estimate.costETH.padEnd(15) : "0").padEnd(15) +
        percentage
      );
    }
  }
  
  console.log("-".repeat(90));
  console.log("total".padEnd(40) + 
             totalEstimatedGas.toLocaleString().padEnd(15) + 
             ethers.utils.formatEther(totalEstimatedCost).padEnd(15) + 
             "100%");
  console.log("=" .repeat(90));

  // total cost estimation
  console.log("\n💰 total cost estimation:");
  console.log("  total estimated gas:", totalEstimatedGas.toLocaleString());
  console.log("  total estimated cost:", ethers.utils.formatEther(totalEstimatedCost), "ETH");

  // add safety margin
  const safetyMargin = totalEstimatedCost.mul(30).div(100); // 30% safety margin
  const recommendedBalance = totalEstimatedCost.add(safetyMargin);
  
  console.log("\n🛡️ recommended configuration:");
  console.log("  safety margin:", ethers.utils.formatEther(safetyMargin), "ETH (30%)");
  console.log("  recommended balance:", ethers.utils.formatEther(recommendedBalance), "ETH");

  // USD estimation (only on Arbitrum)
  if (network.chainId === 42161) {
    const ethPriceUSD = 2500; // estimated ETH price
    const totalUSD = parseFloat(ethers.utils.formatEther(totalEstimatedCost)) * ethPriceUSD;
    const recommendedUSD = parseFloat(ethers.utils.formatEther(recommendedBalance)) * ethPriceUSD;
    
    console.log("\n💵 USD estimation (assuming ETH=$" + ethPriceUSD + "):");
    console.log("  total cost:", totalUSD.toFixed(2), "USD");
    console.log("  recommended balance:", recommendedUSD.toFixed(2), "USD");
  }

  // balance check
  console.log("\n🔍 balance check:");
  console.log("  current balance:", ethers.utils.formatEther(balance), "ETH");
  console.log("  recommended balance:", ethers.utils.formatEther(recommendedBalance), "ETH");
  
  const hasEnough = balance.gte(recommendedBalance);
  console.log("  status:", hasEnough ? "✅ balance enough" : "❌ balance not enough");
  
  if (!hasEnough) {
    const needed = recommendedBalance.sub(balance);
    console.log("  need to recharge:", ethers.utils.formatEther(needed), "ETH");
  }

  // network specific suggestions
  console.log("\n📋 network specific suggestions:");
  if (network.chainId === 42161) {
    console.log("  🌐 Arbitrum One:");
    console.log("    - gas cost is relatively low");
    console.log("    - recommended for production deployment");
    console.log("    - confirmation time: ~1 second");
    console.log("    - recommended gas price: 0.1-1 Gwei");
  } else if (network.chainId === 1) {
    console.log("  🌐 Ethereum Mainnet:");
    console.log("    - gas cost is relatively high");
    console.log("    - adjust gas price based on network congestion");
    console.log("    - confirmation time: ~12 seconds-minutes");
    console.log("    - consider delaying deployment when gas price is high");
  }

  console.log("\n💡 tips:");
  console.log("  • these are estimated values, actual costs may vary");
  console.log("  • gas price fluctuations affect the final cost");
  console.log("  • consider deploying when gas price is low");
  console.log("  • WithdrawVerifier is usually the most expensive contract");
  
  // save estimated results to JSON file
  const estimateData = {
    timestamp: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: network.chainId
    },
    deployer: deployer.address,
    deployerBalance: ethers.utils.formatEther(balance),
    gasPrice: {
      wei: gasPrice.toString(),
      gwei: ethers.utils.formatUnits(gasPrice, "gwei")
    },
    estimates: contractEstimates,
    summary: {
      totalGas: totalEstimatedGas.toString(),
      totalCostETH: ethers.utils.formatEther(totalEstimatedCost),
      safetyMarginETH: ethers.utils.formatEther(safetyMargin),
      recommendedBalanceETH: ethers.utils.formatEther(recommendedBalance),
      hasEnoughBalance: hasEnough
    }
  };

  const estimatePath = path.join(__dirname, `../output/mainnet-cost-estimate-${network.chainId}.json`);
  fs.writeFileSync(estimatePath, JSON.stringify(estimateData, null, 2));
  console.log("\n💾 estimated results saved to:", estimatePath);

  console.log("\n🚀 after preparation, use the following command to deploy:");
  if (network.chainId === 42161) {
    console.log("  npm run mainnet:deploy:arbitrum");
  } else if (network.chainId === 1) {
    console.log("  npm run mainnet:deploy:ethereum");
  } else {
    console.log("  npx hardhat run scripts/mainnet/deploy.ts --network arbitrum");
  }
}

main()
  .then(() => {
    console.log("\n✅ cost estimation completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ estimate failed:", error);
    process.exit(1);
  });