/**
 * find deposit event and get leafIndex
 * query Deposit event from blockchain, extract leafIndex corresponding to commitment
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { getErrorMessage } from "../utils/errorUtils";

async function main() {
  console.log("🔍 find deposit event and get leafIndex...");
  
  // get network information
  const network = await ethers.provider.getNetwork();
  console.log("🌐 current network:", network.name, "Chain ID:", network.chainId);

  // read deposit data
  const dataPath = path.join(__dirname, "../output/mainnet-deposit-data.json");
  
  if (!fs.existsSync(dataPath)) {
    console.log("❌ mainnet-deposit-data.json file not found");
    process.exit(1);
  }

  const depositData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  console.log("📖 deposit data:", {
    commitment: depositData.commitment,
    transactionHash: depositData.transactionHash
  });

  // read contract configuration
  const configPath = path.join(__dirname, "../output/mainnet-deployment.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const poolAddress = config.contracts.Iceberg;

  console.log("🏠 contract address:", poolAddress);

  // connect to contract
  const pool = await ethers.getContractAt("Iceberg", poolAddress);

  try {
    // method 1: directly find event by transaction hash
    if (depositData.transactionHash) {
      console.log("\n📋 find event by transaction hash...");
      const receipt = await ethers.provider.getTransactionReceipt(depositData.transactionHash);
      
      if (receipt) {
        console.log("📋 transaction details:");
        console.log("  to:", receipt.to);
        console.log("  status:", receipt.status);
        console.log("  logs number:", receipt.logs.length);
        
        // parse all events
        const iface = pool.interface;
        const allEvents = receipt.logs
          .map(log => {
            try {
              return iface.parseLog(log);
            } catch {
              return null;
            }
          })
          .filter(log => log !== null);

        console.log("📋 all parsed events:");
        allEvents.forEach(event => {
          console.log(`  - ${event?.name}:`, event?.args);
        });

        const depositEvents = allEvents.filter(log => log && log.name === "Deposit");

        if (depositEvents.length > 0) {
          const depositEvent = depositEvents[0];
          console.log("✅ find Deposit event:");
          console.log("  commitment:", depositEvent.args.commitment);
          console.log("  leafIndex:", depositEvent.args.leafIndex.toString());
          
          // verify commitment matching
          if (depositEvent.args.commitment === depositData.commitment) {
            const leafIndex = depositEvent.args.leafIndex.toNumber();
            console.log("✅ commitment matching!");
            
            // create independent tree-index data file
            const treeIndexData = {
              commitment: depositData.commitment,
              leafIndex: leafIndex,
              blockNumber: receipt.blockNumber,
              transactionHash: depositData.transactionHash,
              timestamp: new Date().toISOString(),
              network: network.name,
              chainId: network.chainId
            };
            
            const treeIndexPath = path.join(__dirname, "../output/mainnet-tree-index.json");
            fs.writeFileSync(treeIndexPath, JSON.stringify(treeIndexData, null, 2));
            console.log("✅ created mainnet-tree-index.json, saved leafIndex:", leafIndex);
            
            return;
          } else {
            console.log("❌ commitment not matching");
          }
        } else {
          console.log("❌ no Deposit event found in this transaction");
        }
      } else {
        console.log("❌ cannot get transaction receipt");
      }
    }

    // method 2: query recent Deposit event
    console.log("\n🔍 query recent Deposit event...");
    
    // get current block number
    const currentBlock = await ethers.provider.getBlockNumber();
    console.log("📊 当前区块号:", currentBlock);
    
    const filter = pool.filters.Deposit();
    
    // query from contract deployment
    const startBlock = Math.max(0, currentBlock - 100000); // query recent 100000 blocks
    console.log(`🔍 query block range: ${startBlock} - ${currentBlock}`);
    
    const events = await pool.queryFilter(filter, startBlock);

    console.log(`📊 find ${events.length} Deposit events`);

    for (const event of events) {
      if (event.args && event.args.commitment === depositData.commitment) {
        const leafIndex = event.args.leafIndex.toNumber();
        console.log("✅ find matching Deposit event:");
        console.log("  block:", event.blockNumber);
        console.log("  transaction:", event.transactionHash);
        console.log("  commitment:", event.args.commitment);
        console.log("  leafIndex:", leafIndex);
        
        // create independent tree-index data file
        const treeIndexData = {
          commitment: depositData.commitment,
          leafIndex: leafIndex,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: new Date().toISOString(),
          network: network.name,
          chainId: network.chainId
        };
        
        const treeIndexPath = path.join(__dirname, "../output/mainnet-tree-index.json");
        fs.writeFileSync(treeIndexPath, JSON.stringify(treeIndexData, null, 2));
        console.log("✅ created mainnet-tree-index.json, saved leafIndex:", leafIndex);
        
        return;
      }
    }

    console.log("❌ no matching Deposit event found");
    
  } catch (error) {
    console.error("❌ find event failed:", getErrorMessage(error));
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ script execution failed:", error);
    process.exit(1);
  });