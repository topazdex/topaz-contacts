import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { parseEther } from "ethers";

const AIRDROPPER_BALANCE = parseEther("200000000"); // 200M tokens

interface AirdropInfo {
  amount: string;
  wallet: string;
}

interface AirdropConfig {
  liquid: AirdropInfo[];
  locked: AirdropInfo[];
}

interface DeployConfig {
  WETH: string;
  allowedManager: string;
  team: string;
  feeManager: string;
  emergencyCouncil: string;
  whitelistTokens: string[];
  minter: AirdropConfig;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, execute, log } = deployments;

  const { deployer } = await getNamedAccounts();

  const balanceLogicLibrary = await deployments.get("BalanceLogicLibrary");
  const delegationLogicLibrary = await deployments.get("DelegationLogicLibrary");
  const perlinNoiseLibrary = await deployments.get("PerlinNoise");
  const trigLibrary = await deployments.get("Trig");

  log(`Deploying core contracts to network: ${network.name}`);
  log(`Deployer: ${deployer}`);

  // Load deployment configuration
  const path = require('path');
  const configPath = path.join(__dirname, '..', 'config', `${network.name}.json`);
  let config: DeployConfig;
  try {
    config = require(configPath);
  } catch (error) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  log(`Using configuration from: ${configPath}`);
  log(`Team address: ${config.team}`);
  log(`Fee manager: ${config.feeManager}`);
  log(`Emergency council: ${config.emergencyCouncil}`);
  log(`WETH address: ${config.WETH}`);

  // Deploy TOPAZ token first
  log("\n=== DEPLOYING CORE CONTRACTS ===");
  const topazDeployment = await deploy("Topaz", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Forwarder
  const forwarderDeployment = await deploy("Forwarder", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Pool implementation
  const poolImplementationDeployment = await deploy("Pool", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Factories in order
  log("\nDeploying factories...");

  log("Deploying PoolFactory...");
  const poolFactoryDeployment = await deploy("PoolFactory", {
    from: deployer,
    args: [poolImplementationDeployment.address],
    log: true,
    waitConfirmations: 1,
  });

  const gaugeFactoryDeployment = await deploy("GaugeFactory", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  const votingRewardsFactoryDeployment = await deploy("VotingRewardsFactory", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  const managedRewardsFactoryDeployment = await deploy("ManagedRewardsFactory", {
    from: deployer,
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Factory Registry
  const factoryRegistryDeployment = await deploy("FactoryRegistry", {
    from: deployer,
    args: [
      poolFactoryDeployment.address,
      votingRewardsFactoryDeployment.address,
      gaugeFactoryDeployment.address,
      managedRewardsFactoryDeployment.address
    ],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy VotingEscrow with all dependencies
  const votingEscrowDeployment = await deploy("VotingEscrow", {
    from: deployer,
    args: [
      forwarderDeployment.address,
      topazDeployment.address,
      factoryRegistryDeployment.address,
    ],
    libraries: {
      BalanceLogicLibrary: balanceLogicLibrary.address,
      DelegationLogicLibrary: delegationLogicLibrary.address,
    },
    log: true,
    waitConfirmations: 1,
  });

  // Deploy VeArt Proxy
  const veArtProxyDeployment = await deploy("VeArtProxy", {
    from: deployer,
    args: [votingEscrowDeployment.address],
    libraries: {
      PerlinNoise: perlinNoiseLibrary.address,
      Trig: trigLibrary.address,
    },
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Rewards Distributor
  const rewardsDistributorDeployment = await deploy("RewardsDistributor", {
    from: deployer,
    args: [votingEscrowDeployment.address],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Voter
  const voterDeployment = await deploy("Voter", {
    from: deployer,
    args: [
      forwarderDeployment.address,
      votingEscrowDeployment.address,
      factoryRegistryDeployment.address,
    ],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Router
  const routerDeployment = await deploy("Router", {
    from: deployer,
    args: [
      forwarderDeployment.address,
      factoryRegistryDeployment.address,
      poolFactoryDeployment.address,
      voterDeployment.address,
      config.WETH,
    ],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Minter
  const minterDeployment = await deploy("Minter", {
    from: deployer,
    args: [
      voterDeployment.address,
      votingEscrowDeployment.address,
      rewardsDistributorDeployment.address,
    ],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Airdrop Distributor
  const airdropDistributorDeployment = await deploy("AirdropDistributor", {
    from: deployer,
    args: [votingEscrowDeployment.address],
    log: true,
    waitConfirmations: 1,
  });

  // Configure core contracts in correct order (following Foundry script pattern)
  log("\n=== CONFIGURING CORE CONTRACTS ===");

  // 1. Set art proxy for VotingEscrow
  log("Setting art proxy for VotingEscrow...");
  await execute(
    "VotingEscrow",
    { from: deployer, log: true },
    "setArtProxy",
    veArtProxyDeployment.address
  );

  // 2. Set voter and distributor for VotingEscrow
  log("Setting voter and distributor for VotingEscrow...");
  await execute(
    "VotingEscrow",
    { from: deployer, log: true },
    "setVoterAndDistributor",
    voterDeployment.address,
    rewardsDistributorDeployment.address
  );

  // 3. Set allowed manager for VotingEscrow
  log("Setting allowed manager for VotingEscrow...");
  await execute(
    "VotingEscrow",
    { from: deployer, log: true },
    "setAllowedManager",
    config.allowedManager
  );

  // 4. Set minter for RewardsDistributor
  log("Setting minter for RewardsDistributor...");
  await execute(
    "RewardsDistributor",
    { from: deployer, log: true },
    "setMinter",
    minterDeployment.address
  );

  // 5. Set minter for TOPAZ token
  log("Setting minter for TOPAZ token...");
  await execute(
    "Topaz",
    { from: deployer, log: true },
    "setMinter",
    minterDeployment.address
  );

  // 6. Initialize voter with whitelist tokens and minter
  log("Initializing voter with tokens and minter...");
  const whitelistTokens = [...config.whitelistTokens, topazDeployment.address];
  await execute(
    "Voter",
    { from: deployer, log: true },
    "initialize",
    whitelistTokens,
    minterDeployment.address
  );

  // 7. Initialize minter with airdrop data (following Foundry pattern)
  log("Initializing minter with airdrop configuration...");
  const { liquidWallets, liquidAmounts, lockedWallets, lockedAmounts } = prepareMinterAirdropData(
    config.minter,
    airdropDistributorDeployment.address
  );

  await execute(
    "Minter",
    { from: deployer, log: true },
    "initialize",
    {
      liquidWallets,
      liquidAmounts,
      lockedWallets,
      lockedAmounts,
    }
  );

  // 8. Set contract ownership and admin addresses (following Foundry pattern)
  log("\n=== SETTING UP GOVERNANCE AND ADMIN ADDRESSES ===");

  const teamAddress = config.team;
  const feeManagerAddress = config.feeManager;
  const emergencyCouncilAddress = config.emergencyCouncil;

  // Set team addresses exactly as in Foundry script
  await execute(
    "VotingEscrow",
    { from: deployer, log: true },
    "setTeam",
    teamAddress
  );

  await execute(
    "Minter",
    { from: deployer, log: true },
    "setTeam",
    teamAddress
  );

  await execute(
    "PoolFactory",
    { from: deployer, log: true },
    "setPauser",
    teamAddress
  );

  await execute(
    "Voter",
    { from: deployer, log: true },
    "setEmergencyCouncil",
    emergencyCouncilAddress
  );

  await execute(
    "Voter",
    { from: deployer, log: true },
    "setEpochGovernor",
    teamAddress
  );

  await execute(
    "Voter",
    { from: deployer, log: true },
    "setGovernor",
    teamAddress
  );

  await execute(
    "FactoryRegistry",
    { from: deployer, log: true },
    "transferOwnership",
    teamAddress
  );

  // Set contract configuration exactly as in Foundry script
  await execute(
    "PoolFactory",
    { from: deployer, log: true },
    "setFeeManager",
    feeManagerAddress
  );

  await execute(
    "PoolFactory",
    { from: deployer, log: true },
    "setVoter",
    voterDeployment.address
  );

  log("\n=== CORE DEPLOYMENT COMPLETED SUCCESSFULLY! ===");
  log(`TOPAZ Token: ${topazDeployment.address}`);
  log(`VotingEscrow: ${votingEscrowDeployment.address}`);
  log(`Forwarder: ${forwarderDeployment.address}`);
  log(`VeArtProxy: ${veArtProxyDeployment.address}`);
  log(`RewardsDistributor: ${rewardsDistributorDeployment.address}`);
  log(`Voter: ${voterDeployment.address}`);
  log(`Router: ${routerDeployment.address}`);
  log(`Minter: ${minterDeployment.address}`);
  log(`PoolFactory: ${poolFactoryDeployment.address}`);
  log(`VotingRewardsFactory: ${votingRewardsFactoryDeployment.address}`);
  log(`GaugeFactory: ${gaugeFactoryDeployment.address}`);
  log(`ManagedRewardsFactory: ${managedRewardsFactoryDeployment.address}`);
  log(`FactoryRegistry: ${factoryRegistryDeployment.address}`);
  log(`AirdropDistributor: ${airdropDistributorDeployment.address}`);

  log("\nNext deployment step: Run 002_deploy_pools_and_gauges.ts");
};

// Helper function to prepare minter airdrop data (following Foundry script pattern)
function prepareMinterAirdropData(
  minterConfig: AirdropConfig,
  airdropDistributorAddress: string
): {
  liquidWallets: string[];
  liquidAmounts: string[];
  lockedWallets: string[];
  lockedAmounts: string[];
} {
  // Add airdrop distributor to liquid wallets with 200M tokens (exactly as in Foundry)
  const liquidWallets = [airdropDistributorAddress, ...minterConfig.liquid.map(item => item.wallet)];
  const liquidAmounts = [AIRDROPPER_BALANCE.toString(), ...minterConfig.liquid.map(item => item.amount)];

  const lockedWallets = minterConfig.locked.map(item => item.wallet);
  const lockedAmounts = minterConfig.locked.map(item => item.amount);

  return {
    liquidWallets,
    liquidAmounts,
    lockedWallets,
    lockedAmounts,
  };
}

export default func;
func.tags = ["Core"];
func.dependencies = ["Libraries"];