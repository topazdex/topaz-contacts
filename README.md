# Topaz Protocol

Smart contracts for the Topaz Protocol, a Solidly-style ve(3,3) AMM on **BNB Chain**. Forked from [Aerodrome Finance](https://github.com/aerodrome-finance/contracts).

See `SPECIFICATION.md` for more detail.

## Protocol Overview

### AMM contracts

| Filename | Description |
| --- | --- |
| `Pool.sol` | AMM constant-product implementation similar to Uniswap V2 liquidity pools |
| `Router.sol` | Handles multi-pool swaps, deposit/withdrawal, similar to Uniswap V2 Router interface |
| `PoolFees.sol` | Stores the liquidity pool trading fees, these are kept separate from the reserves |
| `FactoryRegistry.sol` | Registry of factories approved for creation of pools, gauges, bribes and managed rewards. |

### Tokenomy contracts

| Filename | Description |
| --- | --- |
| `Topaz.sol` | Protocol ERC20 token |
| `VotingEscrow.sol` | Protocol ERC-721 (ve)NFT representing the protocol vote-escrow lock. Beyond standard ve-type functions, there is also the ability to merge, split and create managed nfts. |
| `Minter.sol` | Protocol token minter. Distributes emissions to `Voter.sol` and rebases to `RewardsDistributor.sol`. |
| `RewardsDistributor.sol` | Is used to handle the rebases distribution for (ve)NFTs/lockers. |
| `VeArtProxy.sol` | (ve)NFT art proxy contract, exists for upgradability purposes |
| `AirdropDistributor.sol` | Distributes permanently locked (ve)NFTs to the provided addresses, in the desired amounts. |

### Protocol mechanics contracts

| Filename | Description |
| --- | --- |
| `Voter.sol` | Handles votes for the current epoch, gauge and voting reward creation as well as emission distribution to `Gauge.sol` contracts. |
| `Gauge.sol` | Gauges are attached to a Pool and based on the (ve)NFT votes it receives, it distributes proportional emissions in the form of protocol tokens. Deposits to the gauge take the form of LP tokens for the Pool. In exchange for receiving protocol emissions, claims on fees from the pool are relinquished to the gauge. Standard rewards contract. |
| `rewards/` | |
| `Reward.sol` | Base reward contract to be inherited for distribution of rewards to stakers.
| `VotingReward.sol` | Rewards contracts used by `FeesVotingReward.sol` and `BribeVotingReward.sol` which inherits `Reward.sol`. Rewards are distributed in the following epoch proportionally based on the last checkpoint created by the user, and are earned through "voting" for a pool or gauge. |
| `FeesVotingReward.sol` | Stores LP fees (from the gauge via `PoolFees.sol`) to be distributed for the current voting epoch to it's voters. |
| `BribeVotingReward.sol` | Stores the users/externally provided rewards for the current voting epoch to it's voters. These are deposited externally every week. |
| `ManagedReward.sol` | Staking implementation for managed veNFTs used by `LockedManagedReward.sol` and `FreeManagedReward.sol` which inherits `Reward.sol`.  Rewards can be earned passively by veNFTs who delegate their voting power to a "managed" veNFT.
| `LockedManagedReward.sol` | Handles "locked" rewards (i.e. TOPAZ rewards / rebases that are compounded) for managed NFTs. Rewards are not distributed and only returned to `VotingEscrow.sol` when the user withdraws from the managed NFT. |
| `FreeManagedReward.sol` | Handles "free" (i.e. unlocked) rewards for managed NFTs. Any rewards earned by a managed NFT that a manager passes on will be distributed to the users that deposited into the managed NFT. |

### Governance contracts

| Filename | Description |
| --- | --- |
| `ProtocolGovernor.sol` | OpenZeppelin's Governor contracts used in protocol-wide access control to whitelist tokens for trade  within the protocol, update minting emissions, and create managed veNFTs. |
| `EpochGovernor.sol` | A simple epoch-based governance contract used exclusively for adjusting emissions. |


## Setup

```
yarn install
yarn compile
```

## Testing

```
yarn test
```

## Lint

`yarn format` to run prettier.

`yarn lint` to run solhint.

## Deployment

Deploy scripts use `hardhat-deploy` and target BNB Chain (mainnet chainId 56, testnet chainId 97).

```
yarn deploy:testnet
yarn deploy:mainnet
```

Configure your `.env` file (see `.env.example`) with `PRIVATE_KEY_DEPLOY` and optionally `BSC_MAINNET_RPC_URL` / `BSC_TESTNET_RPC_URL` and `BSCSCAN_API_KEY`.

### Access Control
See `PERMISSIONS.md` for more detail.

## BNB Chain Mainnet Deployment

| Name | Address |
| :--- | :--- |
| TOPAZ | [0xdf002282C1474C9592780618Adda7EaA99998Abd](https://bscscan.com/address/0xdf002282C1474C9592780618Adda7EaA99998Abd#code) |
| VotingEscrow | [0xe951aC65EFE86682311ab0d8995E7A58750c5eB3](https://bscscan.com/address/0xe951aC65EFE86682311ab0d8995E7A58750c5eB3#code) |
| Voter | [0x2F80F810a114223AC69E34E84E735CaD515dAD67](https://bscscan.com/address/0x2F80F810a114223AC69E34E84E735CaD515dAD67#code) |
| Router | [0x1E98c8226e7d452e1888e3d3d2F929346321c6c3](https://bscscan.com/address/0x1E98c8226e7d452e1888e3d3d2F929346321c6c3#code) |
| Minter | [0x606794d37991A426a189fD9FA8664D339A77f8ae](https://bscscan.com/address/0x606794d37991A426a189fD9FA8664D339A77f8ae#code) |
| RewardsDistributor | [0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB](https://bscscan.com/address/0x85e15e7Ad4f20d5ca3A1104B1c2CcE72f5F683dB#code) |
| PoolFactory | [0x65E6cD0eF5D3467030103cf3d433034E570b5784](https://bscscan.com/address/0x65E6cD0eF5D3467030103cf3d433034E570b5784#code) |
| Pool (implementation) | [0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678](https://bscscan.com/address/0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678#code) |
| GaugeFactory | [0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08](https://bscscan.com/address/0xFc080D1EcD7c332022cebf942AEb62d5E1d4Cb08#code) |
| VotingRewardsFactory | [0x4C303f7af7b8b05226440e4e12FF9a82F513716c](https://bscscan.com/address/0x4C303f7af7b8b05226440e4e12FF9a82F513716c#code) |
| ManagedRewardsFactory | [0xe4b23F13b24232C1E68AD0575191216152AA9480](https://bscscan.com/address/0xe4b23F13b24232C1E68AD0575191216152AA9480#code) |
| FactoryRegistry | [0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4](https://bscscan.com/address/0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4#code) |
| Forwarder | [0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b](https://bscscan.com/address/0xE79EB7c4D06ff38e6483921DE8e85A37eC7c731b#code) |
| VeArtProxy | [0x9612305fe63DFb84Da8f6d6261169F6B85026601](https://bscscan.com/address/0x9612305fe63DFb84Da8f6d6261169F6B85026601#code) |
| AirdropDistributor | [0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348](https://bscscan.com/address/0x7B1d8745079C85af80Ff7A7eA7C2C4769Eab5348#code) |
| EpochGovernor | [0xbae5585Afb875A45292470078aa4D4A261749084](https://bscscan.com/address/0xbae5585Afb875A45292470078aa4D4A261749084#code) |
| ProtocolGovernor | [0xbBCdCd30066cF25708F4A0aB9d9149D32Ea4C401](https://bscscan.com/address/0xbBCdCd30066cF25708F4A0aB9d9149D32Ea4C401#code) |

## License

Topaz is released under the [MIT License](LICENSE.md). This codebase is a fork
of [Aerodrome Finance](https://github.com/aerodrome-finance/contracts), which
derives from Velodrome and Solidly (originally released under BUSL-1.1 whose
Change Date has now passed). See `LICENSE.md` for full attribution.
