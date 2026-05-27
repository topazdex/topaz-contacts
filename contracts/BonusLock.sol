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
    uint256 public constant override NUM_TIERS = 7;
    uint256 public constant override TOTAL_BONUS_CAP = 50_000_000e18;
    uint256 public constant override START_TIME = 1779904800;

    /// @inheritdoc IBonusLock
    ITopaz public immutable override topaz;
    /// @inheritdoc IBonusLock
    IVotingEscrow public immutable override ve;

    /// @inheritdoc IBonusLock
    uint256 public override depositedTokenId;
    /// @inheritdoc IBonusLock
    uint256 public override remainingBalance;
    /// @inheritdoc IBonusLock
    uint256 public override totalBonusDistributed;
    /// @inheritdoc IBonusLock
    bool public override paused;

    constructor(address _ve) {
        ve = IVotingEscrow(_ve);
        topaz = ITopaz(IVotingEscrow(_ve).token());
    }

    // ═══════════════════════════════ MODIFIERS ════════════════════════════

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier whenStarted() {
        if (block.timestamp < START_TIME) revert NotStarted();
        _;
    }

    // ═══════════════════════════════ INTERNAL ═════════════════════════════

    function _getTierPercentage(uint256 _tier) internal pure returns (uint256) {
        if (_tier == 0) return 7500;
        if (_tier == 1) return 6000;
        if (_tier == 2) return 5000;
        if (_tier == 3) return 4000;
        if (_tier == 4) return 3000;
        if (_tier == 5) return 2500;
        if (_tier == 6) return 2000;
        return 0;
    }

    function _getTierCeiling(uint256 _tier) internal pure returns (uint256) {
        if (_tier == 0) return 5_000_000e18;
        if (_tier == 1) return 10_000_000e18;
        if (_tier == 2) return 15_000_000e18;
        if (_tier == 3) return 20_000_000e18;
        if (_tier == 4) return 27_500_000e18;
        if (_tier == 5) return 37_500_000e18;
        if (_tier == 6) return 50_000_000e18;
        return 50_000_000e18;
    }

    function _currentTier() internal view returns (uint256) {
        uint256 distributed = totalBonusDistributed;
        for (uint256 i = 0; i < NUM_TIERS; i++) {
            if (distributed < _getTierCeiling(i)) return i;
        }
        return NUM_TIERS;
    }

    /// @dev Handles cross-tier bonus calculation. When a lock spans multiple tiers,
    /// the bonus is split proportionally across each tier at its respective rate.
    function _calculateBonus(uint256 _amount) internal view returns (uint256 totalBonus) {
        uint256 distributed = totalBonusDistributed;
        uint256 remaining = _amount;

        for (uint256 i = 0; i < NUM_TIERS; i++) {
            uint256 ceiling = _getTierCeiling(i);
            if (distributed >= ceiling) continue;
            if (remaining == 0) break;

            uint256 tierAvailable = ceiling - distributed;
            uint256 pct = _getTierPercentage(i);
            uint256 bonusAtTier = (remaining * pct) / DENOMINATOR;

            if (bonusAtTier <= tierAvailable) {
                totalBonus += bonusAtTier;
                break;
            }

            totalBonus += tierAvailable;
            distributed += tierAvailable;
            uint256 consumed = (tierAvailable * DENOMINATOR) / pct;
            remaining -= consumed;
        }
    }

    function _validateAndPrepareVeNFT(uint256 _tokenId) internal returns (uint256 balance) {
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

        balance = uint256(int256(locked.amount));
    }

    // ═══════════════════════════════ VIEW FUNCTIONS ═══════════════════════

    /// @inheritdoc IBonusLock
    function bonusPercentage() external view override returns (uint256) {
        uint256 tier = _currentTier();
        if (tier == NUM_TIERS) return 0;
        return _getTierPercentage(tier);
    }

    /// @inheritdoc IBonusLock
    function currentTier() external view override returns (uint256) {
        return _currentTier();
    }

    /// @inheritdoc IBonusLock
    function tierInfo(
        uint256 _tier
    ) external pure override returns (uint256 percentage, uint256 available, uint256 cumulativeCeiling) {
        if (_tier >= NUM_TIERS) revert InvalidTier();
        percentage = _getTierPercentage(_tier);
        cumulativeCeiling = _getTierCeiling(_tier);
        available = _tier == 0 ? cumulativeCeiling : cumulativeCeiling - _getTierCeiling(_tier - 1);
    }

    /// @inheritdoc IBonusLock
    function tierRemaining(uint256 _tier) external view override returns (uint256) {
        if (_tier >= NUM_TIERS) revert InvalidTier();
        uint256 ceiling = _getTierCeiling(_tier);
        uint256 floor = _tier == 0 ? 0 : _getTierCeiling(_tier - 1);
        uint256 distributed = totalBonusDistributed;
        if (distributed >= ceiling) return 0;
        if (distributed <= floor) return ceiling - floor;
        return ceiling - distributed;
    }

    /// @inheritdoc IBonusLock
    function currentTierDistributed() external view override returns (uint256) {
        uint256 distributed = totalBonusDistributed;
        for (uint256 i = 0; i < NUM_TIERS; i++) {
            if (distributed < _getTierCeiling(i)) {
                uint256 floor = i == 0 ? 0 : _getTierCeiling(i - 1);
                return distributed - floor;
            }
        }
        return 0;
    }

    /// @inheritdoc IBonusLock
    function totalBonusRemaining() external view override returns (uint256) {
        uint256 distributed = totalBonusDistributed;
        if (distributed >= TOTAL_BONUS_CAP) return 0;
        return TOTAL_BONUS_CAP - distributed;
    }

    /// @inheritdoc IBonusLock
    function calculateBonus(uint256 _amount) external view override returns (uint256 bonus) {
        bonus = _calculateBonus(_amount);
    }

    // ═══════════════════════════════ USER FUNCTIONS ═══════════════════════

    /// @inheritdoc IBonusLock
    function lock(uint256 _amount) external override nonReentrant whenNotPaused whenStarted returns (uint256 tokenId) {
        if (_amount == 0) revert ZeroAmount();
        if (depositedTokenId == 0) revert NoVeNFTDeposited();

        uint256 _bonus = _calculateBonus(_amount);
        if (_bonus == 0) revert AllTiersExhausted();
        if (_bonus >= remainingBalance) revert InsufficientBalance();

        topaz.safeTransferFrom(msg.sender, address(this), _amount);
        topaz.safeIncreaseAllowance(address(ve), _amount);

        uint256 _userLock = ve.createLock(_amount, 1 weeks);

        (uint256 _newProtoId, uint256 _bonusLock) = ve.split(depositedTokenId, _bonus);

        ve.unlockPermanent(_bonusLock);
        ve.merge(_userLock, _bonusLock);
        ve.lockPermanent(_bonusLock);

        uint256 _tierBefore = _currentTier();

        depositedTokenId = _newProtoId;
        remainingBalance -= _bonus;
        totalBonusDistributed += _bonus;

        uint256 _tierAfter = _currentTier();

        ve.safeTransferFrom(address(this), msg.sender, _bonusLock);

        if (_tierAfter > _tierBefore) {
            emit TierAdvanced(_tierBefore, _tierAfter);
        }

        emit BonusLocked(msg.sender, _bonusLock, _amount, _bonus);
        return _bonusLock;
    }

    /// @inheritdoc IBonusLock
    function lockWithExisting(
        uint256 _tokenId,
        uint256 _amount
    ) external override nonReentrant whenNotPaused whenStarted returns (uint256 tokenId) {
        if (_amount == 0) revert ZeroAmount();
        if (depositedTokenId == 0) revert NoVeNFTDeposited();

        if (ve.escrowType(_tokenId) != IVotingEscrow.EscrowType.NORMAL) revert NotNormalEscrow();

        ve.safeTransferFrom(msg.sender, address(this), _tokenId);

        topaz.safeTransferFrom(msg.sender, address(this), _amount);
        topaz.safeIncreaseAllowance(address(ve), _amount);

        ve.increaseAmount(_tokenId, _amount);

        uint256 _bonus = _calculateBonus(_amount);
        if (_bonus == 0) revert AllTiersExhausted();
        if (_bonus >= remainingBalance) revert InsufficientBalance();

        (uint256 _newProtoId, uint256 _bonusLock) = ve.split(depositedTokenId, _bonus);

        ve.unlockPermanent(_bonusLock);
        ve.merge(_bonusLock, _tokenId);

        IVotingEscrow.LockedBalance memory _locked = ve.locked(_tokenId);
        if (!_locked.isPermanent) {
            ve.lockPermanent(_tokenId);
        }

        uint256 _tierBefore = _currentTier();

        depositedTokenId = _newProtoId;
        remainingBalance -= _bonus;
        totalBonusDistributed += _bonus;

        uint256 _tierAfter = _currentTier();

        ve.safeTransferFrom(address(this), msg.sender, _tokenId);

        if (_tierAfter > _tierBefore) {
            emit TierAdvanced(_tierBefore, _tierAfter);
        }

        emit BonusLockedWithExisting(msg.sender, _tokenId, _amount, _bonus);
        return _tokenId;
    }

    // ═══════════════════════════════ ADMIN FUNCTIONS ══════════════════════

    /// @inheritdoc IBonusLock
    function depositVeNFT(uint256 _tokenId) external override onlyOwner nonReentrant {
        if (depositedTokenId != 0) revert InvalidParams();

        uint256 balance = _validateAndPrepareVeNFT(_tokenId);

        depositedTokenId = _tokenId;
        remainingBalance = balance;

        emit VeNFTDeposited(_tokenId, balance);
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
    function swapVeNFT(uint256 _newTokenId) external override onlyOwner nonReentrant {
        if (depositedTokenId == 0) revert NoVeNFTDeposited();
        if (_newTokenId == depositedTokenId) revert InvalidParams();

        uint256 _oldTokenId = depositedTokenId;

        uint256 balance = _validateAndPrepareVeNFT(_newTokenId);

        depositedTokenId = _newTokenId;
        remainingBalance = balance;

        ve.safeTransferFrom(address(this), msg.sender, _oldTokenId);

        emit VeNFTSwapped(_oldTokenId, _newTokenId, balance);
    }

    /// @inheritdoc IBonusLock
    function refreshBalance() external override onlyOwner {
        if (depositedTokenId == 0) revert NoVeNFTDeposited();
        IVotingEscrow.LockedBalance memory locked = ve.locked(depositedTokenId);
        remainingBalance = uint256(int256(locked.amount));
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
