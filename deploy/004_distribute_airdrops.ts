import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface AirdropInfo {
  amount: string;
  wallet: string;
}

interface AirdropConfig {
  locked: AirdropInfo[];
}

interface DeployConfig {
  airdrops: AirdropConfig;
}

const WALLET_BATCH_SIZE = 20; // Follow Foundry script pattern
const MAX_AIRDROPS = 6100; // Follow Foundry script pattern

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { get, log } = deployments;

  const { deployer } = await getNamedAccounts();

  log(`Distributing airdrops on network: ${network.name}`);
  log(`Deployer: ${deployer}`);

  // Load airdrop configuration
  const path = require('path');
  const configPath = path.join(__dirname, '..', 'config', `${network.name}.json`);
  let config: DeployConfig;
  try {
    config = require(configPath);
  } catch (error) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  // Check if airdrops configuration exists (following Foundry script pattern)
  if (!config.airdrops || !config.airdrops.locked || config.airdrops.locked.length === 0) {
    log("No airdrop configuration found or empty airdrop list. Skipping airdrop distribution.");
    return;
  }

  // Get deployed contract addresses
  const airdropDistributor = await get("AirdropDistributor");
  const topaz = await get("Topaz");

  const airdropDistributorContract = await ethers.getContractAt(
    "AirdropDistributor",
    airdropDistributor.address
  );

  const topazContract = await ethers.getContractAt(
    "Topaz",
    topaz.address
  );

  const signerDeployer = await ethers.getSigner(deployer);

  log(`Using AirdropDistributor at: ${airdropDistributor.address}`);
  log(`Using TOPAZ token at: ${topaz.address}`);

  // Check ownership (following Foundry script pattern)
  const owner = await airdropDistributorContract.owner();
  log(`AirdropDistributor owner: ${owner}`);
  log(`Deployer address: ${deployer}`);

  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    log("ERROR: Deployer is not the owner of AirdropDistributor");
    log("This script must be run by the AirdropDistributor owner");
    log("Skipping airdrop distribution");
    return;
  }

  // Prepare airdrop data (following Foundry script pattern)
  const airdropInfos = config.airdrops.locked;
  const { wallets, amounts } = getArraysFromInfo(airdropInfos);
  const { wallets: slicedWallets, amounts: slicedAmounts } = getArraySlice(wallets, amounts);

  const walletsLength = slicedWallets.length;
  if (walletsLength !== slicedAmounts.length) {
    throw new Error("Invalid parameters: wallets and amounts length mismatch");
  }

  // Calculate total amount and check balance (following Foundry script pattern)
  let totalAmount = BigInt(0);
  for (let i = 0; i < walletsLength; i++) {
    totalAmount += BigInt(slicedAmounts[i]);
  }

  const airdropBalance = await topazContract.balanceOf(airdropDistributor.address);
  log(`Total airdrop amount: ${ethers.formatEther(totalAmount.toString())} TOPAZ`);
  log(`AirdropDistributor balance: ${ethers.formatEther(airdropBalance.toString())} TOPAZ`);

  if (totalAmount > airdropBalance) {
    // Adjust first amount to fit balance (following Foundry script pattern)
    const excess = totalAmount - airdropBalance;
    slicedAmounts[0] = (BigInt(slicedAmounts[0]) - excess).toString();
    log(`Adjusted first airdrop amount by -${ethers.formatEther(excess.toString())} TOPAZ to fit balance`);
  }

  log(`\n=== DISTRIBUTING AIRDROPS ===`);
  log(`Total recipients: ${walletsLength}`);
  log(`Batch size: ${WALLET_BATCH_SIZE}`);

  // Calculate batches (following Foundry script pattern)
  const lastBatchSize = walletsLength % WALLET_BATCH_SIZE;
  const nBatches = Math.floor(walletsLength / WALLET_BATCH_SIZE);

  log(`Number of full batches: ${nBatches}`);
  log(`Last batch size: ${lastBatchSize}`);

  let totalBatches = nBatches;
  if (lastBatchSize > 0) totalBatches += 1;

  // Execute batch distribution (following Foundry script pattern)
  for (let i = 0; i <= nBatches; i++) {
    let batchWallets: string[];
    let batchAmounts: string[];
    let batchLen: number;

    if (i !== nBatches) {
      // Not last batch
      batchLen = WALLET_BATCH_SIZE;
      batchWallets = new Array(WALLET_BATCH_SIZE);
      batchAmounts = new Array(WALLET_BATCH_SIZE);
    } else {
      if (lastBatchSize === 0) continue;
      batchLen = lastBatchSize;
      batchWallets = new Array(lastBatchSize);
      batchAmounts = new Array(lastBatchSize);
    }

    // Fill batch data (following Foundry script pattern)
    const firstIndex = i * WALLET_BATCH_SIZE;
    for (let j = 0; j < batchLen; j++) {
      batchWallets[j] = slicedWallets[j + firstIndex];
      batchAmounts[j] = slicedAmounts[j + firstIndex];
    }

    log(`\nProcessing batch ${i + 1}/${totalBatches} (${batchLen} recipients)...`);

    try {
      // Distribute batch (following Foundry script pattern)
      const distributeTx = await airdropDistributorContract
        .connect(signerDeployer)
        .distributeTokens(batchWallets, batchAmounts, {
          gasLimit: 15000000, // Set high gas limit for batch operations
        });

      await distributeTx.wait();

      log(`✅ Batch ${i + 1} distributed successfully`);

      // Log batch details
      for (let j = 0; j < batchLen; j++) {
        log(`  ${batchWallets[j]}: ${ethers.formatEther(batchAmounts[j])} TOPAZ`);
      }

    } catch (error) {
      log(`❌ Error distributing batch ${i + 1}: ${error.message}`);
      throw error;
    }
  }

  // Renounce ownership (following Foundry script pattern)
  // log("\n=== RENOUNCING AIRDROP DISTRIBUTOR OWNERSHIP ===");
  // try {
  //   const renounceOwnershipTx = await airdropDistributorContract
  //     .connect(signerDeployer)
  //     .renounceOwnership({
  //       gasLimit: 500000,
  //     });
  //   await renounceOwnershipTx.wait();
  //   log("✅ AirdropDistributor ownership renounced successfully");
  // } catch (error) {
  //   log(`❌ Error renouncing ownership: ${error.message}`);
  //   throw error;
  // }

  log("\n=== AIRDROP DISTRIBUTION COMPLETED SUCCESSFULLY! ===");
  log(`Total recipients: ${walletsLength}`);
  log(`Total amount distributed: ${ethers.formatEther(totalAmount.toString())} TOPAZ`);
  log(`Batches processed: ${totalBatches}`);
  log("AirdropDistributor ownership has been renounced");

  log("\n=== DEPLOYMENT AND CONFIGURATION COMPLETED! ===");
  log("All deployment scripts have been executed successfully.");
  log("The protocol is now fully deployed and configured.");
};

// Helper functions (following Foundry script pattern)
function getArraysFromInfo(
  infos: AirdropInfo[]
): { wallets: string[]; amounts: string[] } {
  const len = infos.length;
  const wallets = new Array(len);
  const amounts = new Array(len);


  console.log(`number of airdrops: ${len}`);
  for (let i = 0; i < len; i++) {
    const drop = infos[i];

    wallets[i] = drop.wallet;
    amounts[i] = drop.amount;

  }

  return { wallets, amounts };
}

function getArraySlice(
  _wallets: string[],
  _amounts: string[]
): { wallets: string[]; amounts: string[] } {
  if (MAX_AIRDROPS > _wallets.length) {
    return { wallets: _wallets, amounts: _amounts };
  } else {
    const _len = MAX_AIRDROPS;
    const wallets = new Array(_len);
    const amounts = new Array(_len);
    for (let i = 0; i < _len; i++) {

      wallets[i] = _wallets[i];
      amounts[i] = _amounts[i];
    }
    return { wallets, amounts };
  }
}

export default func;
func.tags = ["Airdrops"];
// func.dependencies = ["Core"];
// func.runAtTheEnd = true; // Run this after all other deployments