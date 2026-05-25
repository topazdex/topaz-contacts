// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ITopaz} from "./interfaces/ITopaz.sol";
import {IVotingEscrow} from "./interfaces/IVotingEscrow.sol";
import {IVoter} from "./interfaces/IVoter.sol";
import {IRewardsDistributor} from "./interfaces/IRewardsDistributor.sol";
import {IBonusLock} from "./interfaces/IBonusLock.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ProtocolTimeLibrary} from "./libraries/ProtocolTimeLibrary.sol";

contract BonusLock is IBonusLock, Ownable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for ITopaz;

    uint256 public constant DENOMINATOR = 10_000;
    uint256 public constant MAX_BONUS_PERCENTAGE = 10_000;

    /// @inheritdoc IBonusLock
    ITopaz public immutable override topaz;
    /// @inheritdoc IBonusLock
    IVotingEscrow public immutable override ve;

    /// @inheritdoc IBonusLock
    uint256 public override depositedTokenId;
    /// @inheritdoc IBonusLock
    uint256 public override remainingBalance;
    /// @inheritdoc IBonusLock
    uint256 public override bonusPercentage;
    /// @inheritdoc IBonusLock
    bool public override paused;

    constructor(address _ve, uint256 _bonusPercentage) {
        if (_bonusPercentage > MAX_BONUS_PERCENTAGE) revert InvalidParams();
        ve = IVotingEscrow(_ve);
        topaz = ITopaz(IVotingEscrow(_ve).token());
        bonusPercentage = _bonusPercentage;
    }

    // ═══════════════════════════════ MODIFIERS ════════════════════════════

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ═══════════════════════════════ VIEW FUNCTIONS ═══════════════════════

    /// @inheritdoc IBonusLock
    function calculateBonus(uint256 _amount) external view override returns (uint256 bonus) {
        bonus = (_amount * bonusPercentage) / DENOMINATOR;
    }

    // ═══════════════════════════════ USER FUNCTIONS ═══════════════════════

    /// @inheritdoc IBonusLock
    function lock(uint256 _amount) external override nonReentrant whenNotPaused returns (uint256 tokenId) {
        if (_amount == 0) revert ZeroAmount();
        if (depositedTokenId == 0) revert NoVeNFTDeposited();

        uint256 _bonus = (_amount * bonusPercentage) / DENOMINATOR;
        if (_bonus == 0) revert InvalidParams();
        if (_bonus >= remainingBalance) revert InsufficientBalance();

        topaz.safeTransferFrom(msg.sender, address(this), _amount);
        topaz.safeIncreaseAllowance(address(ve), _amount);

        uint256 _userLock = ve.createLock(_amount, 1 weeks);

        (uint256 _newProtoId, uint256 _bonusLock) = ve.split(depositedTokenId, _bonus);

        ve.unlockPermanent(_bonusLock);
        ve.merge(_userLock, _bonusLock);
        ve.lockPermanent(_bonusLock);

        depositedTokenId = _newProtoId;
        remainingBalance -= _bonus;

        ve.safeTransferFrom(address(this), msg.sender, _bonusLock);

        emit BonusLocked(msg.sender, _bonusLock, _amount, _bonus);
        return _bonusLock;
    }

    /// @inheritdoc IBonusLock
    function lockWithExisting(
        uint256 _tokenId,
        uint256 _amount
    ) external override nonReentrant whenNotPaused returns (uint256 tokenId) {
        if (_amount == 0) revert ZeroAmount();
        if (depositedTokenId == 0) revert NoVeNFTDeposited();

        if (ve.escrowType(_tokenId) != IVotingEscrow.EscrowType.NORMAL) revert NotNormalEscrow();

        ve.safeTransferFrom(msg.sender, address(this), _tokenId);

        topaz.safeTransferFrom(msg.sender, address(this), _amount);
        topaz.safeIncreaseAllowance(address(ve), _amount);

        ve.increaseAmount(_tokenId, _amount);

        uint256 _bonus = (_amount * bonusPercentage) / DENOMINATOR;
        if (_bonus == 0) revert InvalidParams();
        if (_bonus >= remainingBalance) revert InsufficientBalance();

        (uint256 _newProtoId, uint256 _bonusLock) = ve.split(depositedTokenId, _bonus);

        ve.unlockPermanent(_bonusLock);
        ve.merge(_bonusLock, _tokenId);

        IVotingEscrow.LockedBalance memory _locked = ve.locked(_tokenId);
        if (!_locked.isPermanent) {
            ve.lockPermanent(_tokenId);
        }

        depositedTokenId = _newProtoId;
        remainingBalance -= _bonus;

        ve.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit BonusLockedWithExisting(msg.sender, _tokenId, _amount, _bonus);
        return _tokenId;
    }

    // ═══════════════════════════════ ADMIN FUNCTIONS ══════════════════════

    /// @inheritdoc IBonusLock
    function depositVeNFT(uint256 _tokenId) external override onlyOwner {
        if (depositedTokenId != 0) revert InvalidParams();

        IVotingEscrow.LockedBalance memory locked = ve.locked(_tokenId);
        if (!locked.isPermanent) revert InvalidParams();
        if (locked.amount <= 0) revert InvalidParams();

        if (ve.escrowType(_tokenId) != IVotingEscrow.EscrowType.NORMAL) revert InvalidParams();

        if (!ve.canSplit(address(this)) && !ve.canSplit(address(0))) revert SplitNotEnabled();

        address voter = ve.voter();

        if (block.timestamp <= ProtocolTimeLibrary.epochVoteStart(block.timestamp)) {
            revert InvalidParams();
        }

        if (ve.voted(_tokenId)) {
            uint256 currentEpochStart = ProtocolTimeLibrary.epochStart(block.timestamp);
            uint256 lastVotedEpoch = IVoter(voter).lastVoted(_tokenId);

            if (currentEpochStart <= lastVotedEpoch) {
                revert InvalidParams();
            }
        }

        ve.safeTransferFrom(msg.sender, address(this), _tokenId);

        if (ve.voted(_tokenId)) {
            IVoter(voter).reset(_tokenId);
        }

        address distributor = ve.distributor();
        uint256 claimable = IRewardsDistributor(distributor).claimable(_tokenId);
        if (claimable > 0) {
            IRewardsDistributor(distributor).claim(_tokenId);
            locked = ve.locked(_tokenId);
        }

        depositedTokenId = _tokenId;
        remainingBalance = uint256(int256(locked.amount));

        emit VeNFTDeposited(_tokenId, remainingBalance);
    }

    /// @inheritdoc IBonusLock
    function withdrawVeNFT(address _recipient) external override onlyOwner {
        if (_recipient == address(0)) revert InvalidRecipient();
        if (depositedTokenId == 0) revert NoVeNFTDeposited();

        uint256 _tokenId = depositedTokenId;
        if (ve.ownerOf(_tokenId) != address(this)) revert NoVeNFTDeposited();

        depositedTokenId = 0;
        remainingBalance = 0;

        ve.safeTransferFrom(address(this), _recipient, _tokenId);

        emit VeNFTWithdrawn(_tokenId, _recipient);
    }

    /// @inheritdoc IBonusLock
    function setBonusPercentage(uint256 _percentage) external override onlyOwner {
        if (_percentage > MAX_BONUS_PERCENTAGE) revert InvalidParams();
        uint256 _old = bonusPercentage;
        bonusPercentage = _percentage;
        emit BonusPercentageUpdated(_old, _percentage);
    }

    /// @inheritdoc IBonusLock
    function pause() external override onlyOwner {
        if (paused) revert InvalidParams();
        paused = true;
        emit Paused(msg.sender);
    }

    /// @inheritdoc IBonusLock
    function unpause() external override onlyOwner {
        if (!paused) revert NotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @inheritdoc IBonusLock
    function recoverToken(uint256 _tokenId, address _recipient) external override onlyOwner {
        if (_recipient == address(0)) revert InvalidRecipient();
        if (ve.ownerOf(_tokenId) != address(this)) revert NotOwned();
        if (_tokenId == depositedTokenId) revert InvalidParams();

        ve.safeTransferFrom(address(this), _recipient, _tokenId);
        emit TokenRecovered(_tokenId, _recipient);
    }

    // ═══════════════════════════════ ERC721 RECEIVER ═════════════════════

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
