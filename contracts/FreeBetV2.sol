// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interface/ILP.sol";
import "./interface/IWNative.sol";

/// @title Azuro free bet contract
contract FreeBetV2 is ERC721Upgradeable, OwnableUpgradeable {
    struct Bet {
        uint128 amount;
        uint64 minOdds;
        uint64 durationTime;
    }

    struct AzuroBet {
        address owner;
        uint256 freeBetId;
        uint128 amount;
        uint128 payout;
    }

    ILP public LP;
    string public baseURI;
    address public token;
    uint256 public lockedReserve;
    mapping(uint256 => Bet) public freeBets;
    mapping(uint256 => AzuroBet) public azuroBets;
    mapping(uint256 => uint64) public expirationTime;
    uint256 public lastTokenId;
    mapping(address => bool) public maintainers;

    event LpChanged(address indexed newLp);
    event FreeBetMinted(address indexed receiver, uint256 indexed id, Bet bet);
    event FreeBetMintedBatch(address[] receivers, uint256[] ids, Bet[] bets);
    event FreeBetRedeemed(
        address indexed bettor,
        uint256 indexed id,
        uint256 indexed azuroBetId,
        uint128 amount
    );
    event FreeBetReissued(
        address indexed receiver,
        uint256 indexed id,
        Bet bet
    );
    event MaintainerUpdated(address maintainer, bool active);
    event BettorWin(address bettor, uint256 azuroBetId, uint128 amount);

    error OnlyBetOwner();
    error InsufficientAmount();
    error DifferentArraysLength();
    error WrongToken();
    error InsufficientContractBalance();
    error NonTransferable();
    error BetExpired();
    error OddsTooSmall();
    error ZeroAmount();
    error ZeroDuration();
    error OnlyMaintainer();
    error AlreadyResolved();

    /**
     * @notice Only permits calls by Maintainers.
     */
    modifier onlyMaintainer() {
        _checkOnlyMaintainer();
        _;
    }

    receive() external payable {
        if (msg.sender != token) {
            // add reserves
            IWNative(token).deposit{value: msg.value}();
        }
        // else let withdraw reserves of token via withdrawReserveNative
    }

    function initialize(address token_) external initializer {
        __ERC721_init("FreeBetV2", "FBTV2");
        __Ownable_init();
        if (token_ == address(0)) revert WrongToken();
        token = token_;
    }

    /**
     * @notice Owner: sets 'lp' as LP address
     * @param lp LP address
     */
    function setLp(address lp) external onlyOwner {
        LP = ILP(lp);
        emit LpChanged(lp);
    }

    /**
     * @notice Owner: sets 'uri' as base NFT URI
     * @param uri base URI string
     */
    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    /**
     * @notice Owner: Set whether `maintainer` is active maintainer or not.
     * @param maintainer address of a maintainer
     * @param active true if maintainer is active
     */
    function updateMaintainer(address maintainer, bool active)
        external
        onlyOwner
    {
        maintainers[maintainer] = active;
        emit MaintainerUpdated(maintainer, active);
    }

    /**
     * @notice Get all expired and not yet burned free bets IDs
     * @param start Starting free bet ID to search from
     * @param count Number of IDs to search through
     * @return Array of found IDs and its size (remaining elements filled with 0)
     */
    function getExpiredUnburned(uint256 start, uint256 count)
        external
        view
        returns (uint256[] memory, uint256)
    {
        uint256[] memory ids = new uint256[](count);
        uint256 index;
        uint256 end = start + count;
        Bet storage bet;

        for (uint256 id = start; id < end; id++) {
            bet = freeBets[id];
            if (bet.amount > 0 && expirationTime[id] <= block.timestamp) {
                ids[index++] = id;
            }
        }
        return (ids, index);
    }

    /**
     * @notice Burn expired free bets with given IDs
     * @param ids Array of IDs to check expiration and burn
     */
    function burnExpired(uint256[] calldata ids) external {
        uint256 burnedAmount;
        uint256 len = ids.length;
        uint256 id;
        Bet storage bet;
        uint128 amount;

        for (uint256 i = 0; i < len; i++) {
            id = ids[i];
            bet = freeBets[id];
            amount = bet.amount;

            if (amount > 0 && expirationTime[id] <= block.timestamp) {
                burnedAmount += amount;
                bet.amount = 0;
                _burn(id);
            }
        }

        lockedReserve -= burnedAmount;
    }

    /**
     * @notice Maintainer: withdraw unlocked token reserves
     * @param amount Amount to withdraw
     */
    function withdrawReserve(uint128 amount) external onlyMaintainer {
        _checkInsufficient(amount);

        TransferHelper.safeTransfer(token, msg.sender, amount);
    }

    /**
     * @notice Maintainer: withdraw unlocked token reserves in native currency
     * @param amount Amount to withdraw
     */
    function withdrawReserveNative(uint128 amount) external onlyMaintainer {
        _checkInsufficient(amount);

        IWNative(token).withdraw(amount);
        TransferHelper.safeTransferETH(msg.sender, amount);
    }

    /**
     * @notice Maintainer: mint free bets to users
     * @dev Arrays must have the same length, receivers[i] is mapped with bets[i]
     * @param receivers Addresses to mint free bets to
     * @param bets Free bet params
     */
    function mintBatch(address[] calldata receivers, Bet[] calldata bets)
        external
        onlyMaintainer
    {
        uint256 receiversLength = receivers.length;
        if (receiversLength != bets.length) revert DifferentArraysLength();
        uint256[] memory ids = new uint256[](receiversLength);
        uint256 lastId = lastTokenId;
        uint128 amountsSum;

        for (uint256 i = 0; i < receiversLength; i++) {
            ids[i] = ++lastId;
            amountsSum += bets[i].amount;
            _safeMint(receivers[i], lastId, bets[i]);
        }

        _checkInsufficient(amountsSum);

        lastTokenId = lastId;
        lockedReserve += amountsSum;

        emit FreeBetMintedBatch(receivers, ids, bets);
    }

    /**
     * @notice Maintainer: mint free bet to user
     * @param to Address to mint free bet to
     * @param bet Free bet params
     */
    function mint(address to, Bet calldata bet) external onlyMaintainer {
        _checkInsufficient(bet.amount);

        lockedReserve += bet.amount;
        uint256 newId = ++lastTokenId;

        _safeMint(to, newId, bet);
        emit FreeBetMinted(to, newId, bet);
    }

    /**
     * @notice Redeem free bet and make real bet
     * @param id ID of free bet
     * @param conditionId The match or game ID
     * @param amount Amount of free bet to redeem (can be partial)
     * @param outcomeId ID of predicted outcome
     * @param deadline The time before which the bet should be made
     * @param minOdds Minimum allowed bet odds
     * @return Minted Azuro bet ID
     */
    function redeem(
        uint256 id,
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external returns (uint256) {
        if (ownerOf(id) != msg.sender) revert OnlyBetOwner();

        Bet storage bet = freeBets[id];
        if (bet.amount < amount) revert InsufficientAmount();
        if (expirationTime[id] <= block.timestamp) revert BetExpired();
        if (bet.minOdds > minOdds) revert OddsTooSmall();

        lockedReserve -= amount;
        bet.amount -= amount;

        TransferHelper.safeApprove(token, address(LP), amount);
        uint256 azuroBetId = LP.bet(
            conditionId,
            amount,
            outcomeId,
            deadline,
            minOdds
        );

        azuroBets[azuroBetId] = AzuroBet(msg.sender, id, amount, 0);
        emit FreeBetRedeemed(msg.sender, id, azuroBetId, amount);
        return azuroBetId;
    }

    /**
     * @notice Resolve bet payout
     * @param azuroBetId The ID of Azuro bet to resolve
     */
    function resolvePayout(uint256 azuroBetId) external {
        azuroBets[azuroBetId].payout = _resolvePayout(azuroBetId);
    }

    /**
     * @notice Withdraw bet payout for bettor (reward or 0)
     * @param azuroBetId The ID of Azuro bet to withdraw
     */
    function withdrawPayout(uint256 azuroBetId) external {
        uint128 payout = _withdrawPayout(azuroBetId);
        if (payout > 0) {
            TransferHelper.safeTransfer(token, msg.sender, payout);
        }
    }

    /**
     * @notice Withdraw bet payout for bettor (reward or 0) in native currency
     * @param azuroBetId The ID of Azuro bet to withdraw
     */
    function withdrawPayoutNative(uint256 azuroBetId) external {
        uint128 payout = _withdrawPayout(azuroBetId);
        if (payout > 0) {
            IWNative(token).withdraw(payout);
            TransferHelper.safeTransferETH(msg.sender, payout);
        }
    }

    function _withdrawPayout(uint256 azuroBetId) internal returns (uint128) {
        AzuroBet storage azuroBet = azuroBets[azuroBetId];
        if (azuroBet.owner != msg.sender) revert OnlyBetOwner();

        uint128 payout;
        if (azuroBet.amount == 0) {
            // was resolved
            payout = azuroBet.payout;
            if (payout > 0) azuroBet.payout = 0;
        } else {
            // was not resolved
            payout = _resolvePayout(azuroBetId);
        }

        if (payout > 0) {
            emit BettorWin(azuroBet.owner, azuroBetId, payout);
        }

        return payout;
    }

    function _resolvePayout(uint256 azuroBetId) internal returns (uint128) {
        AzuroBet storage azuroBet = azuroBets[azuroBetId];
        uint128 betAmount = azuroBet.amount;
        if (betAmount == 0) revert AlreadyResolved();

        (, uint128 fullPayout) = LP.viewPayout(azuroBetId);
        if (fullPayout > 0) {
            LP.withdrawPayout(azuroBetId);
        }

        uint256 freeBetId = azuroBet.freeBetId;
        if (fullPayout != betAmount) {
            // win or lose
            if (freeBets[freeBetId].amount == 0) {
                _burn(freeBetId);
            }
        } else {
            // cancel
            Bet storage bet = freeBets[freeBetId];
            bet.amount += betAmount;
            lockedReserve += betAmount;
            expirationTime[freeBetId] =
                uint64(block.timestamp) +
                bet.durationTime;

            emit FreeBetReissued(azuroBet.owner, freeBetId, bet);
        }

        azuroBet.amount = 0;
        return (fullPayout > betAmount) ? (fullPayout - betAmount) : 0;
    }

    function _safeMint(
        address to,
        uint256 id,
        Bet calldata bet
    ) internal {
        if (bet.amount == 0) revert ZeroAmount();
        if (bet.durationTime == 0) revert ZeroDuration();
        freeBets[id] = bet;
        expirationTime[id] = uint64(block.timestamp) + bet.durationTime;

        _safeMint(to, id);
    }

    function _transfer(
        address,
        address,
        uint256
    ) internal pure override {
        revert NonTransferable();
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function _checkInsufficient(uint128 amount) internal view {
        if (IERC20(token).balanceOf(address(this)) < lockedReserve + amount)
            revert InsufficientContractBalance();
    }

    function _checkOnlyMaintainer() internal view {
        if (!maintainers[msg.sender]) revert OnlyMaintainer();
    }
}
