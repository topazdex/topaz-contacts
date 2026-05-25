import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { log } = deployments;

  const { deployer } = await getNamedAccounts();
  const signer = await ethers.getSigner(deployer);

  log("=".repeat(60));
  log("005: Setting up Governance Configuration");
  log("=".repeat(60));

  // Get deployed contract addresses
  const voterDeployment = await deployments.get("Voter");
  const epochGovernorDeployment = await deployments.get("EpochGovernor");
  const protocolGovernorDeployment = await deployments.get("ProtocolGovernor");

  log(`Deployer/Team address: ${deployer}`);
  log(`Voter contract: ${voterDeployment.address}`);
  log(`EpochGovernor contract: ${epochGovernorDeployment.address}`);
  log(`ProtocolGovernor contract: ${protocolGovernorDeployment.address}`);

  // Connect to contracts
  const voter = await ethers.getContractAt("Voter", voterDeployment.address, signer);
  const protocolGovernor = await ethers.getContractAt("ProtocolGovernor", protocolGovernorDeployment.address, signer);

  try {
    // 1. Set Epoch Governor in Voter contract
    log("\n1. Setting Epoch Governor in Voter contract...");

    // Check if already set
    const currentEpochGovernor = await voter.epochGovernor();
    if (currentEpochGovernor === epochGovernorDeployment.address) {
      log(`   ✓ Epoch Governor already set to: ${epochGovernorDeployment.address}`);
    } else {
      log(`   Current Epoch Governor: ${currentEpochGovernor}`);
      log(`   Setting to: ${epochGovernorDeployment.address}`);

      const setEpochGovTx = await voter.setEpochGovernor(epochGovernorDeployment.address);
      await setEpochGovTx.wait();

      log(`   ✓ Epoch Governor set successfully`);
      log(`   Transaction: ${setEpochGovTx.hash}`);
    }

    // 2. Set Protocol Governor in Voter contract
    log("\n2. Setting Protocol Governor in Voter contract...");

    // Check if already set
    const currentGovernor = await voter.governor();
    if (currentGovernor === protocolGovernorDeployment.address) {
      log(`   ✓ Protocol Governor already set to: ${protocolGovernorDeployment.address}`);
    } else {
      log(`   Current Governor: ${currentGovernor}`);
      log(`   Setting to: ${protocolGovernorDeployment.address}`);

      const setGovTx = await voter.setGovernor(protocolGovernorDeployment.address);
      await setGovTx.wait();

      log(`   ✓ Protocol Governor set successfully`);
      log(`   Transaction: ${setGovTx.hash}`);
    }

    // 3. Accept vetoer role in Protocol Governor
    log("\n3. Accepting vetoer role in Protocol Governor...");

    try {
      // Check current vetoer
      const currentVetoer = await protocolGovernor.vetoer();
      log(`   Current vetoer: ${currentVetoer}`);

      // Check if deployer is the pending vetoer
      const pendingVetoer = await protocolGovernor.pendingVetoer();
      log(`   Pending vetoer: ${pendingVetoer}`);

      if (currentVetoer === deployer) {
        log(`   ✓ Deployer is already the vetoer`);
      } else if (pendingVetoer === deployer) {
        log(`   Accepting vetoer role...`);

        const acceptVetoerTx = await protocolGovernor.acceptVetoer();
        await acceptVetoerTx.wait();

        log(`   ✓ Vetoer role accepted successfully`);
        log(`   Transaction: ${acceptVetoerTx.hash}`);

        // Verify the change
        const newVetoer = await protocolGovernor.vetoer();
        log(`   New vetoer: ${newVetoer}`);
      } else {
        log(`   ⚠️  Deployer is not the pending vetoer. Current pending: ${pendingVetoer}`);
        log(`   ⚠️  The vetoer role may need to be transferred manually by the current vetoer.`);
      }
    } catch (error: any) {
      log(`   ⚠️  Could not accept vetoer role: ${error.message}`);
      log(`   This may be expected if the role transfer process is different.`);
    }

    // Verification section
    log("\n" + "=".repeat(60));
    log("GOVERNANCE SETUP VERIFICATION");
    log("=".repeat(60));

    // Verify all settings
    const finalEpochGovernor = await voter.epochGovernor();
    const finalGovernor = await voter.governor();
    const finalVetoer = await protocolGovernor.vetoer();

    log(`✓ Voter.epochGovernor(): ${finalEpochGovernor}`);
    log(`✓ Voter.governor(): ${finalGovernor}`);
    log(`✓ ProtocolGovernor.vetoer(): ${finalVetoer}`);

    // Check if all configurations are correct
    const epochGovCorrect = finalEpochGovernor === epochGovernorDeployment.address;
    const protocolGovCorrect = finalGovernor === protocolGovernorDeployment.address;
    const vetoerCorrect = finalVetoer === deployer;

    log("\nConfiguration Status:");
    log(`Epoch Governor: ${epochGovCorrect ? "✅ CORRECT" : "❌ INCORRECT"}`);
    log(`Protocol Governor: ${protocolGovCorrect ? "✅ CORRECT" : "❌ INCORRECT"}`);
    log(`Vetoer Role: ${vetoerCorrect ? "✅ CORRECT" : "❌ NEEDS ATTENTION"}`);

    if (epochGovCorrect && protocolGovCorrect && vetoerCorrect) {
      log("\n🎉 ALL GOVERNANCE CONFIGURATIONS SUCCESSFUL! 🎉");
    } else {
      log("\n⚠️  Some configurations may need manual attention.");
    }

  } catch (error: any) {
    log(`\n❌ Governance setup failed: ${error.message}`);

    // Log helpful information for manual execution
    log("\n" + "=".repeat(60));
    log("MANUAL EXECUTION INSTRUCTIONS");
    log("=".repeat(60));
    log("If this script fails, you can execute these commands manually:");
    log("");
    log("1. Set Epoch Governor:");
    log(`   voter.setEpochGovernor("${epochGovernorDeployment.address}")`);
    log("");
    log("2. Set Protocol Governor:");
    log(`   voter.setGovernor("${protocolGovernorDeployment.address}")`);
    log("");
    log("3. Accept vetoer role:");
    log(`   protocolGovernor.acceptVetoer()`);
    log("");
    log(`All commands should be executed by: ${deployer}`);

    throw error;
  }

  log("\n" + "=".repeat(60));
  log("005: Governance setup completed");
  log("=".repeat(60));
};

export default func;
func.tags = ["005_governance"];
func.dependencies = ["003_governors"]; // Depends on governors being deployed