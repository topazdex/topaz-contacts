import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, log } = deployments;

  const { deployer } = await getNamedAccounts();

  log(`Deploying BonusLock to network: ${network.name}`);
  log(`Deployer: ${deployer}`);

  const votingEscrow = await get("VotingEscrow");

  const bonusLockDeployment = await deploy("BonusLock", {
    from: deployer,
    args: [votingEscrow.address],
    log: true,
    waitConfirmations: 1,
  });

  log(`BonusLock deployed at: ${bonusLockDeployment.address}`);
  log(`Tiered bonus: 75% → 60% → 50% → 40% → 30% → 25% → 20% (50M total)`);
  log(`\nPost-deployment steps:`);
  log(`  1. Call ve.toggleSplit(${bonusLockDeployment.address}, true) from team address`);
  log(`  2. Call bonusLock.depositVeNFT(tokenId) with a permanent veNFT`);
};

export default func;
func.tags = ["BonusLock"];
