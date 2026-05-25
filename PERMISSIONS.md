# Protocol Access Control
## User Roles and Abilities
### Anyone
- Can swap tokens through the Protocol DEX.
- Can provide liquidity.
- Can create a Normal veNFT.
- Can deposit TOPAZ into an existing Normal veNFT.
- Can poke the balance of an existing veNFT to sync the balance.
- Can bribe a liquidity pool through its' linked BribeVotingRewards contract.
- Can skim a stable or volatile liquidity pool to rebalance the reserves.
- Can sync a liquidity pool to record historical price
- Can trigger the emission of TOPAZ at the start of an epoch
- Can create a liquidity pool with two different ERC20 tokens if the pool is not already created
- Can create a gauge for the liquidity pool if the gauge is not already created and the tokens are whitelisted

### Liquidity provider (LP)
- Can deposit their LP token into the Protocol gauge linked to the liquidity pool
    - Earns TOPAZ emissions

### veNFT Hodler
- For a detailed breakdown refer to [VOTINGESCROW.md](VOTINGESCROW.md)

#### Normal, Normal Permanent, and Managed veNFT
- Can approve/revoke an address to modify the veNFT
- Can transfer ownership of the veNFT
- Can increase amount locked
- Can vote weekly on pool(s)
    - Earns bribes and trading fees
    - Earns weekly distribution of TOPAZ rebases
- Can vote on ProtocolGovernor proposals
- Can vote on EpochGovernor proposals

#### Normal veNFT
- Can withdraw the normal veNFT
- Can convert to/from Permanent state
- Can increase the lock time

#### Normal and Normal Permanent veNFT
- Can split the veNFT
- Can merge the veNFT

#### Normal Permanent and Managed veNFT
- Can delegate voting power 

#### Locked veNFT
- Can only withdraw their Locked veNFT from a Managed veNFT

---

## Admin Roles and Abilities
### Who

#### Protocol Team
Multisig controlled by the Topaz team.

#### EmergencyCouncil
Multisig controlled by the Topaz team.

#### Vetoer
Protocol team at deployment of ProtocolGovernor. At a later date, this role will be renounced.

#### ProtocolGovernor (aka. Governor)
At first deployment, team. At a later date, this will be set to a lightly modified [Governor](https://docs.openzeppelin.com/contracts/4.x/api/governance#governor) contract from OpenZeppelin, [ProtocolGovernor](contracts/ProtocolGovernor.sol).

#### EpochGovernor
At first deployment, team. Before the tail rate of emissions is reached, this will be set to [EpochGovernor](contracts/EpochGovernor.sol).

#### Allowed Manager
At first deployment, team. This role will likely be given to a contract so that it can create managed nfts (e.g. for autocompounders etc)

#### Fee Manager
Protocol team

#### Pauser
Protocol team

#### Factory Registry Owner
Protocol team

## Permissions List
This is an exhaustive list of all admin permissions in the protocol, sorted by the contract they are stored in.

#### [PoolFactory](https://bscscan.com/address/0x65E6cD0eF5D3467030103cf3d433034E570b5784#code)
- Pauser
    - Controls pause state of swaps on UniswapV2 pools created by this factory.  Users are still freely able to add/remove liquidity
    - Can set Pauser role
- FeeManager
    - Controls default and custom fees for stable / volatile pools.

#### [FactoryRegistry](https://bscscan.com/address/0x268d1C8a538Ecf6628838C11d581e1EABD13D6A4#code)
- Owner
    - Can approve / unapprove new pool / gauge / reward factory combinations.
    - This is used to add new pools, gauges or reward factory combinations. These new pools / gauges / rewards factories may have different code to existing implementations.

#### [Minter](https://bscscan.com/address/0x606794d37991A426a189fD9FA8664D339A77f8ae#code)
- Team
    - Can set PendingTeam in Minter
    - Can accept itself as team in Minter (requires being set as pendingTeam by previous team)
    - Can set team rate in Minter
- EpochGovernor
    - Can nudge the Minter to adjust the TOPAZ emissions rate.

#### [ProtocolGovernor](https://bscscan.com/address/0xbBCdCd30066cF25708F4A0aB9d9149D32Ea4C401#code)
- Vetoer
    - Can set vetoer in ProtocolGovernor.
    - Can veto proposals.
    - Can renounce vetoer role.

#### [Voter](https://bscscan.com/address/0x2F80F810a114223AC69E34E84E735CaD515dAD67#code)
- Governor
    - Can set governor in Voter.
    - Can set epochGovernor in Voter.
    - Can create a gauge for an address that is not a pool.
    - Can set the maximum number of pools that one can vote on.
    - Can whitelist a token to be used as a reward token in voting rewards or in managed free rewards.
    - Can whitelist an NFT to vote during the privileged epoch window.
    - Can create managed NFTs in VotingEscrow.
    - Can set allowedManager in VotingEscrow.
    - Can activate or deactivate managed NFTs in VotingEscrow.
- EpochGovernor
    - Can execute one proposal per epoch to adjust the TOPAZ emission rate after the tail emission rate has been reached in Minter.
- EmergencyCouncil
    - Can set emergencyCouncil in Voter.
    - Can kill a gauge.
    - Can revive a gauge.
    - Can set a custom name or symbol for a Uniswap V2 pool.
    - Can activate or deactivate managed NFTs in VotingEscrow.

#### [VotingEscrow](https://bscscan.com/address/0xe951aC65EFE86682311ab0d8995E7A58750c5eB3#code)
- Team
    - Can set team in VotingEscrow
    - Can set artProxy in VotingEscrow.
    - Can enable split functionality for a single address.
    - Can enable split functionality for all addresses.
    - Can set proposalNumerator in ProtocolGovernor.
- AllowedManager
    - Can create managed NFTs in VotingEscrow.


## Contract Roles and Abilities
In addition to defined admin roles, various contracts within the protocol have unique permissions in calling other contracts.  These permissions are immutable.

#### [Minter](https://bscscan.com/address/0x606794d37991A426a189fD9FA8664D339A77f8ae#code)
- Can mint TOPAZ and distribute to Voter for gauge emissions and RewardsDistributor for claimable rebases
    - `Minter.updatePeriod()`

#### [Voter](https://bscscan.com/address/0x2F80F810a114223AC69E34E84E735CaD515dAD67#code)
- Can distribute TOPAZ emissions to gauges
    - `Voter.distribute()`
- Can claim fees and rewards earned by Normal veNFTs
    - `Voter.claimFees()`
    - `Voter.claimBribes()`
- Can deposit a Normal veNFT into a Managed veNFT
    - `Voter.depositManaged()`
- Can withdraw a Locked veNFT from a Managed veNFT
    - `Voter.withdrawManaged()`
- Can set voting status of a veNFT
    - `Voter.vote()`
    - `Voter.reset()`
- Can deposit and withdraw balances from `BribeVotingReward` and `FeesVotingReward`
    - `Voter.vote()`
    - `Voter.reset()`

#### [VotingEscrow](https://bscscan.com/address/0xe951aC65EFE86682311ab0d8995E7A58750c5eB3#code)
- Can deposit balances into `LockedManagedReward`
    - `VotingEscrow.depositManaged()`
- Can deposit balances into `FreeManagedReward`
    - `VotingEscrow.depositManaged()`
- Can withdraw balances from `LockedManagedReward` and `FreeManagedReward`, and rewards earned from `LockedManagedReward`
    - `VotingEscrow.withdrawManaged()`
- Can notify rewards to `LockedManagedReward`. These rewards are always in TOPAZ.
    - `VotingEscrow.increaseAmount()`
    - `VotingEscrow.depositFor()`

#### [Pool](https://bscscan.com/address/0xdC942D8e37cC20BCf9aD1Fe0111eE6c5908f3678#code)
- Can claim the fees accrued from trades
    - `Pool.claimFees()`
