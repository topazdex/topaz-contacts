import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface DeployConfig {
  team: string;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { deploy, get, log } = deployments;

  const { deployer } = await getNamedAccounts();

  log(`Deploying governors to network: ${network.name}`);
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

  // Get deployed contract addresses from previous deployments
  const votingEscrow = await get("VotingEscrow");
  const forwarder = await get("Forwarder");
  const minter = await get("Minter");

  log(`Using VotingEscrow at: ${votingEscrow.address}`);
  log(`Using Forwarder at: ${forwarder.address}`);
  log(`Using Minter at: ${minter.address}`);

  log("\n=== DEPLOYING GOVERNOR CONTRACTS ===");

  // Deploy Protocol Governor (following Foundry script pattern)
  log("Deploying Protocol Governor...");
  const protocolGovernorDeployment = await deploy("ProtocolGovernor", {
    from: deployer,
    args: [votingEscrow.address],
    log: true,
    waitConfirmations: 1,
  });

  // Deploy Epoch Governor (following Foundry script pattern)
  log("Deploying Epoch Governor...");
  const epochGovernorDeployment = await deploy("EpochGovernor", {
    from: deployer,
    args: [
      forwarder.address,
      votingEscrow.address,
      minter.address,
    ],
    log: true,
    waitConfirmations: 1,
  });

  // Set up governor configuration (following Foundry script pattern)
  log("\n=== CONFIGURING GOVERNOR CONTRACTS ===");

  const protocolGovernorContract = await ethers.getContractAt(
    "ProtocolGovernor",
    protocolGovernorDeployment.address
  );

  const votingEscrowContract = await ethers.getContractAt(
    "VotingEscrow",
    votingEscrow.address
  );

  const signerDeployer = await ethers.getSigner(deployer);

  // Get the team address from VotingEscrow (should be set in previous deployment)
  log("Getting team address from VotingEscrow...");
  const teamAddress = await votingEscrowContract.team();
  log(`Team address from VotingEscrow: ${teamAddress}`);

  // Set vetoer for Protocol Governor (exactly as in Foundry script)
  log("Setting vetoer for Protocol Governor...");
  try {
    const setVetoerTx = await protocolGovernorContract
      .connect(signerDeployer)
      .setVetoer(teamAddress, {
        gasLimit: 500000,
      });
    await setVetoerTx.wait();
    log(`✅ Protocol Governor vetoer set to: ${teamAddress}`);
  } catch (error) {
    log(`❌ Error setting vetoer: ${error.message}`);
    throw error;
  }

  log("\n=== GOVERNORS DEPLOYMENT COMPLETED SUCCESSFULLY! ===");
  log(`Protocol Governor: ${protocolGovernorDeployment.address}`);
  log(`Epoch Governor: ${epochGovernorDeployment.address}`);
  log(`Vetoer address: ${teamAddress}`);

  log("\n=== IMPORTANT: MANUAL GOVERNANCE SETUP REQUIRED ===");
  log("The following actions must be performed manually by the team address:");
  log(`Team address: ${teamAddress}`);
  log("");
  log("1. Set Epoch Governor in Voter contract:");
  log(`   voter.setEpochGovernor(\"${epochGovernorDeployment.address}\")`);
  log("");
  log("2. Set Protocol Governor in Voter contract:");
  log(`   voter.setGovernor(\"${protocolGovernorDeployment.address}\")`);
  log("");
  log("3. Accept vetoer role in Protocol Governor:");
  log(`   protocolGovernor.acceptVetoer()`);
  log("");
  log("These actions require the team address to have the appropriate permissions.");
  log("Make sure to execute these steps after deployment to complete governance setup.");

  log("\nNext deployment step: Run 004_distribute_airdrops.ts (if airdrops are configured)");
};

export default func;
func.tags = ["Governors"];
// func.dependencies = ["Core"];