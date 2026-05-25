import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.22",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: process.env.PRIVATE_KEY_DEPLOY ? [process.env.PRIVATE_KEY_DEPLOY] : [],
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: process.env.PRIVATE_KEY_DEPLOY ? [process.env.PRIVATE_KEY_DEPLOY] : [],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    team: {
      default: 1,
      bscTestnet: process.env.TEAM_ADDRESS || "",
      bscMainnet: process.env.TEAM_ADDRESS || "",
    },
    feeManager: {
      default: 2,
      bscTestnet: process.env.FEE_MANAGER_ADDRESS || "",
      bscMainnet: process.env.FEE_MANAGER_ADDRESS || "",
    },
    emergencyCouncil: {
      default: 3,
      bscTestnet: process.env.EMERGENCY_COUNCIL_ADDRESS || "",
      bscMainnet: process.env.EMERGENCY_COUNCIL_ADDRESS || "",
    },
    allowedManager: {
      default: 4,
      bscTestnet: process.env.ALLOWED_MANAGER_ADDRESS || "",
      bscMainnet: process.env.ALLOWED_MANAGER_ADDRESS || "",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "./deploy",
    deployments: "./deployments",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
