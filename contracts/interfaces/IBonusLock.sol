// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ITopaz} from "./ITopaz.sol";
import {IVotingEscrow} from "./IVotingEscrow.sol";

interface IBonusLock {
    error InvalidParams();
    error InvalidRecipient();
    error NoVeNFTDeposited();
    error InsufficientBalance();
    error SplitNotEnabled();
    error SplitFailed();
    error NotOwned();
    error NotNormalEscrow();
    error ContractPaused();
    error NotPaused();
    error ZeroAmount();
    error ZeroAddress();

    event VeNFTDeposited(uint256 indexed tokenId, uint256 amount);
    event VeNFTWithdrawn(uint256 indexed tokenId, address indexed recipient);
    event BonusLocked(
        address indexed user,
        uint256 indexed tokenId,
        uint256 userAmount,
        uint256 bonusAmount
    );
    event BonusLockedWithExisting(
        address indexed user,
        uint256 indexed tokenId,
        uint256 freshAmount,
        uint256 bonusAmount
    );
    event BonusPercentageUpdated(uint256 oldPercentage, uint256 newPercentage);
    event Paused(address account);
    event Unpaused(address account);
    event TokenRecovered(uint256 indexed tokenId, address indexed recipient);

    /// @notice Interface of Topaz.sol
    function topaz() external view returns (ITopaz);

    /// @notice Interface of IVotingEscrow.sol
    function ve() external view returns (IVotingEscrow);

    /// @notice The tokenId of the deposited protocol veNFT
    function depositedTokenId() external view returns (uint256);

    /// @notice Remaining balance available for bonuses in the protocol lock
    function remainingBalance() external view returns (uint256);

    /// @notice Bonus percentage in basis points (10000 = 100%)
    function bonusPercentage() external view returns (uint256);

    /// @notice Whether the contract is paused
    function paused() external view returns (bool);

    /// @notice Calculate the bonus amount for a given deposit
    /// @param _amount The amount of TOPAZ to lock
    /// @return bonus The bonus amount that would be applied
    function calculateBonus(uint256 _amount) external view returns (uint256 bonus);

    /// @notice Lock fresh TOPAZ and receive a permanent veNFT with bonus
    /// @param _amount Amount of TOPAZ to lock
    /// @return tokenId The resulting veNFT token ID sent to the user
    function lock(uint256 _amount) external returns (uint256 tokenId);

    /// @notice Lock fresh TOPAZ into an existing veNFT and receive bonus
    /// @param _tokenId Existing veNFT to augment (caller must approve this contract)
    /// @param _amount Amount of fresh TOPAZ to add
    /// @return tokenId The resulting veNFT token ID (same as _tokenId)
    function lockWithExisting(uint256 _tokenId, uint256 _amount) external returns (uint256 tokenId);

    /// @notice Deposit a permanent veNFT as the protocol bonus pool
    /// @param _tokenId The permanent veNFT to deposit
    function depositVeNFT(uint256 _tokenId) external;

    /// @notice Withdraw the protocol veNFT
    /// @param _recipient Address to receive the veNFT
    function withdrawVeNFT(address _recipient) external;

    /// @notice Set the bonus percentage in basis points
    /// @param _percentage New bonus percentage (max 10000)
    function setBonusPercentage(uint256 _percentage) external;

    /// @notice Pause the contract (blocks user locks)
    function pause() external;

    /// @notice Unpause the contract
    function unpause() external;

    /// @notice Recover a stuck veNFT (not the protocol lock)
    /// @param _tokenId Token to recover
    /// @param _recipient Recipient address
    function recoverToken(uint256 _tokenId, address _recipient) external;
}
