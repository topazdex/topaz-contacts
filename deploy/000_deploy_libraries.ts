import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface LibraryConfig {
  label: string;
  contract: string;
}

const LIBRARIES: LibraryConfig[] = [
  { label: "PerlinNoise", contract: "contracts/art/PerlinNoise.sol:PerlinNoise" },
  { label: "Trig", contract: "contracts/art/Trig.sol:Trig" },
  { label: "BalanceLogicLibrary", contract: "contracts/libraries/BalanceLogicLibrary.sol:BalanceLogicLibrary" },
  { label: "DelegationLogicLibrary", contract: "contracts/libraries/DelegationLogicLibrary.sol:DelegationLogicLibrary" },
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, getOrNull, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`Deploying shared libraries to network: ${network.name}`);
  log(`Deployer: ${deployer}`);

  for (const library of LIBRARIES) {
    const existingDeployment = await getOrNull(library.label);

    if (existingDeployment) {
      log(`Library ${library.label} already deployed at ${existingDeployment.address}`);
      continue;
    }

    log(`Deploying library ${library.label}...`);
    await deploy(library.label, {
      contract: library.contract,
      from: deployer,
      log: true,
      waitConfirmations: 1,
    });
  }

  log("\n=== LIBRARY DEPLOYMENT COMPLETE ===");
};

export default func;
func.tags = ["Libraries"];
