import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

interface PoolConfig {
  stable: boolean;
  tokenA: string;
  tokenB: string;
}

interface PoolTopazConfig {
  stable: boolean;
  token: string;
}

interface DeployConfig {
  pools: PoolConfig[];
  poolsTopaz: PoolTopazConfig[];
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { get, log, save } = deployments;

  const { deployer } = await getNamedAccounts();

  log(`Deploying pools and gauges to network: ${network.name}`);
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

  // Skip deployment if no pools are configured
  if ((!config.pools || config.pools.length === 0) && (!config.poolsTopaz || config.poolsTopaz.length === 0)) {
    log("No pools configured for deployment. Skipping pools and gauges deployment.");
    return;
  }

  // Get deployed contract addresses from previous deployment
  const poolFactory = await get("PoolFactory");
  const voter = await get("Voter");
  const topaz = await get("Topaz");

  const poolFactoryContract = await ethers.getContractAt("PoolFactory", poolFactory.address);
  const voterContract = await ethers.getContractAt("Voter", voter.address);
  const signerDeployer = await ethers.getSigner(deployer);

  const deployedPools: string[] = [];
  const deployedGauges: string[] = [];

  const resolvePoolAddress = async (
    tokenA: string,
    tokenB: string,
    stable: boolean,
    receipt: any
  ): Promise<string> => {
    if (receipt && receipt.logs) {
      for (const entry of receipt.logs) {
        try {
          const parsed = poolFactoryContract.interface.parseLog(entry);
          if (parsed && parsed.name === "PoolCreated") {
            return parsed.args.pool;
          }
        } catch {
          // not a PoolFactory log, skip
        }
      }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const addr = await poolFactoryContract.getPool(tokenA, tokenB, stable);
      if (addr !== ethers.ZeroAddress) return addr;
    }
    return ethers.ZeroAddress;
  };

  const resolveGaugeAddress = async (
    poolAddress: string,
    receipt: any
  ): Promise<string> => {
    if (receipt && receipt.logs) {
      for (const entry of receipt.logs) {
        try {
          const parsed = voterContract.interface.parseLog(entry);
          if (parsed && parsed.name === "GaugeCreated") {
            return parsed.args.gauge;
          }
        } catch {
          // not a Voter log, skip
        }
      }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const addr = await voterContract.gauges(poolAddress);
      if (addr !== ethers.ZeroAddress) return addr;
    }
    return ethers.ZeroAddress;
  };

  log(`Using PoolFactory at: ${poolFactory.address}`);
  log(`Using Voter at: ${voter.address}`);
  log(`Using TOPAZ token at: ${topaz.address}`);

  // Deploy non-TOPAZ pools and their gauges (following Foundry script pattern)
  if (config.pools && config.pools.length > 0) {
    log(`\n=== DEPLOYING NON-TOPAZ POOLS AND GAUGES ===`);
    log(`Number of non-TOPAZ pools to deploy: ${config.pools.length}`);

    for (let i = 0; i < config.pools.length; i++) {
      const poolConfig = config.pools[i];

      log(`\nCreating pool ${i + 1}/${config.pools.length}:`);
      log(`  TokenA: ${poolConfig.tokenA}`);
      log(`  TokenB: ${poolConfig.tokenB}`);
      log(`  Stable: ${poolConfig.stable}`);

      try {
        // Reuse existing pool if already created in a prior run
        let poolAddress = await poolFactoryContract.getPool(
          poolConfig.tokenA,
          poolConfig.tokenB,
          poolConfig.stable
        );

        if (poolAddress === ethers.ZeroAddress) {
          const poolTx = await poolFactoryContract.connect(signerDeployer).createPool(
            poolConfig.tokenA,
            poolConfig.tokenB,
            poolConfig.stable,
            {
              gasLimit: 8000000,
            }
          );
          const poolReceipt = await poolTx.wait();

          poolAddress = await resolvePoolAddress(
            poolConfig.tokenA,
            poolConfig.tokenB,
            poolConfig.stable,
            poolReceipt
          );

          if (poolAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to create pool for ${poolConfig.tokenA}/${poolConfig.tokenB}`);
          }

          log(`  Pool created: ${poolAddress}`);
        } else {
          log(`  Pool already exists: ${poolAddress}`);
        }

        // Reuse existing gauge if already created in a prior run
        let gaugeAddress = await voterContract.gauges(poolAddress);

        if (gaugeAddress === ethers.ZeroAddress) {
          const gaugeTx = await voterContract.connect(signerDeployer).createGauge(
            poolFactory.address,
            poolAddress,
            {
              gasLimit: 15000000,
            }
          );
          const gaugeReceipt = await gaugeTx.wait();

          gaugeAddress = await resolveGaugeAddress(poolAddress, gaugeReceipt);
        } else {
          log(`  Gauge already exists: ${gaugeAddress}`);
        }

        if (gaugeAddress === ethers.ZeroAddress) {
          throw new Error(`Failed to create gauge for pool ${poolAddress}`);
        }

        deployedPools.push(poolAddress);
        deployedGauges.push(gaugeAddress);

        log(`  Gauge created: ${gaugeAddress}`);
        log(`  ✅ Pool and gauge deployment successful`);

      } catch (error) {
        log(`  ❌ Error deploying pool ${i + 1}: ${error.message}`);
        throw error;
      }
    }
  }

  // Deploy TOPAZ pools and their gauges (following Foundry script pattern)
  if (config.poolsTopaz && config.poolsTopaz.length > 0) {
    log(`\n=== DEPLOYING TOPAZ POOLS AND GAUGES ===`);
    log(`Number of TOPAZ pools to deploy: ${config.poolsTopaz.length}`);

    for (let i = 0; i < config.poolsTopaz.length; i++) {
      const poolConfig = config.poolsTopaz[i];

      log(`\nCreating TOPAZ pool ${i + 1}/${config.poolsTopaz.length}:`);
      log(`  TOPAZ: ${topaz.address}`);
      log(`  Token: ${poolConfig.token}`);
      log(`  Stable: ${poolConfig.stable}`);

      try {
        // Reuse existing pool if already created in a prior run
        let poolAddress = await poolFactoryContract.getPool(
          topaz.address,
          poolConfig.token,
          poolConfig.stable
        );

        if (poolAddress === ethers.ZeroAddress) {
          const poolTx = await poolFactoryContract.connect(signerDeployer).createPool(
            topaz.address,
            poolConfig.token,
            poolConfig.stable,
            {
              gasLimit: 8000000,
            }
          );
          const poolReceipt = await poolTx.wait();

          poolAddress = await resolvePoolAddress(
            topaz.address,
            poolConfig.token,
            poolConfig.stable,
            poolReceipt
          );

          if (poolAddress === ethers.ZeroAddress) {
            throw new Error(`Failed to create TOPAZ pool for ${topaz.address}/${poolConfig.token}`);
          }

          log(`  Pool created: ${poolAddress}`);
        } else {
          log(`  Pool already exists: ${poolAddress}`);
        }

        // Reuse existing gauge if already created in a prior run
        let gaugeAddress = await voterContract.gauges(poolAddress);

        if (gaugeAddress === ethers.ZeroAddress) {
          const gaugeTx = await voterContract.connect(signerDeployer).createGauge(
            poolFactory.address,
            poolAddress,
            {
              gasLimit: 15000000,
            }
          );
          const gaugeReceipt = await gaugeTx.wait();

          gaugeAddress = await resolveGaugeAddress(poolAddress, gaugeReceipt);
        } else {
          log(`  Gauge already exists: ${gaugeAddress}`);
        }

        if (gaugeAddress === ethers.ZeroAddress) {
          throw new Error(`Failed to create gauge for TOPAZ pool ${poolAddress}`);
        }

        deployedPools.push(poolAddress);
        deployedGauges.push(gaugeAddress);

        log(`  Gauge created: ${gaugeAddress}`);
        log(`  ✅ TOPAZ pool and gauge deployment successful`);

      } catch (error) {
        log(`  ❌ Error deploying TOPAZ pool ${i + 1}: ${error.message}`);
        throw error;
      }
    }
  }

  // Save deployment data for reference (following Foundry script output pattern)
  await save("DeployedPools", {
    abi: [],
    address: ethers.ZeroAddress, // dummy address for data storage
    args: [],
    linkedData: {
      pools: deployedPools,
      gauges: deployedGauges,
    },
  });

  log(`\n=== POOLS AND GAUGES DEPLOYMENT COMPLETED! ===`);
  log(`Total pools deployed: ${deployedPools.length}`);
  log(`Total gauges deployed: ${deployedGauges.length}`);

  if (deployedPools.length > 0) {
    log(`\nDeployed Pools:`);
    deployedPools.forEach((pool, index) => {
      log(`  ${index + 1}. ${pool}`);
    });

    log(`\nDeployed Gauges:`);
    deployedGauges.forEach((gauge, index) => {
      log(`  ${index + 1}. ${gauge}`);
    });
  }

  log("\nNext deployment step: Run 003_deploy_governors.ts");
};

export default func;
func.tags = ["Pools", "Gauges"];
func.dependencies = [];