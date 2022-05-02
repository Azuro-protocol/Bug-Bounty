// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interface/ILP.sol";
import "./interface/ICore.sol";
import "./interface/IAzuroBet.sol";
import "./utils/LiquidityTree.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

/// @title Azuro liquidity pool
contract LP is
    LiquidityTree,
    OwnableUpgradeable,
    ERC721EnumerableUpgradeable,
    ILP
{
    uint128 public lockedLiquidity; // liquidity reserved by conditions (initial reinforcement)
    uint128 public totalDaoRewards;

    uint128 public oracleFee;
    uint128 public daoFee;

    uint128 public reinforcementAbility; // should be 50%
    uint64 public multiplier;
    address public token;
    ICore public core;
    IAzuroBet public azuroBet;

    uint128 public minDepo; // minimum deposit amount
    uint64 public withdrawTimeout; // Deposit - Withdraw Timeout

    mapping(uint48 => uint64) public withdrawals; // withdrawals[depNum] = withdrawal time

    /**
     * @notice Only permits calls if the deadline is not yet due.
     * @param  deadline time after which the call is not allowed
     */
    modifier ensure(uint256 deadline) {
        if (block.timestamp >= deadline) revert ConditionStarted();
        _;
    }

    /**
     * @notice Only permits calls by Core.
     */
    modifier onlyCore() {
        if (msg.sender != address(core)) revert OnlyCore();
        _;
    }

    /**
     * @notice Owner: Set `newCore` as Core address.
     * @param  newCore new Core contract address
     */
    function changeCore(address newCore) external override onlyOwner {
        if (address(core) != address(0) && core.getLockedPayout() != 0)
            revert PaymentLocked();

        core = ICore(newCore);
    }

    /**
     * @notice Owner: Set `newOracleFee` as oracles fee.
     */
    function changeOracleReward(uint128 newOracleFee) external onlyOwner {
        oracleFee = newOracleFee;
        emit OracleRewardChanged(newOracleFee);
    }

    /**
     * @notice Owner: Set `newDaoFee` as DAO fee.
     */
    function changeDaoReward(uint128 newDaoFee) external onlyOwner {
        daoFee = newDaoFee;
        emit DaoRewardChanged(newDaoFee);
    }

    /**
     * @notice Owner: Set `newAzuroBet` as AzuroBet address.
     * @param  newAzuroBet new AzuroBet contract address
     */
    function changeAzuroBet(address newAzuroBet) external onlyOwner {
        azuroBet = IAzuroBet(newAzuroBet);
        emit AzuroBetChanged(newAzuroBet);
    }

    /**
     * @notice Owner: Set `minDepo` as newMinDepo value.
     * @param  newMinDepo new minDepo value
     */
    function changeMinDepo(uint128 newMinDepo) external onlyOwner {
        minDepo = newMinDepo;
        emit MinDepoChanged(newMinDepo);
    }

    /**
     * @notice Owner: Set `withdrawTimeout` as newWithdrawTimeout value.
     * @param  newWithdrawTimeout new withdrawTimeout value
     */
    function changeWithdrawTimeout(uint64 newWithdrawTimeout)
        external
        onlyOwner
    {
        withdrawTimeout = newWithdrawTimeout;
        emit WithdrawTimeoutChanged(newWithdrawTimeout);
    }

    function initialize(address token_, address azuroBetAddress)
        external
        virtual
        initializer
    {
        if (token_ == address(0)) revert WrongToken();
        __Ownable_init_unchained();
        __ERC721_init("Azuro LP NFT token", "LP-AZR");
        __liquidityTree_init();
        token = token_;
        azuroBet = IAzuroBet(azuroBetAddress);
        multiplier = 1e9;
        oracleFee = 1e7; // 1%
        daoFee = 9 * 1e7; // 9%
        reinforcementAbility = multiplier / 2; // 50%
    }

    /**
     * @notice Add some liquidity in pool in exchange for LPNFT tokens
     * @param  amount token's amount to swap
     */
    function addLiquidity(uint128 amount) external override {
        if (amount < minDepo) revert AmountNotSufficient();

        uint48 leaf = nodeAddLiquidity(amount);

        // make NFT
        _mint(msg.sender, leaf);
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        withdrawals[leaf] = uint64(block.timestamp);
        emit LiquidityAdded(msg.sender, amount, leaf);
    }

    /**
     * @notice Withdraw liquidity for some NFT deposite #.
     * @param depNum - NFT with deposite number
     * @param percent - percent of leaf amount 1*10^12 is 100%, 5*10^11 is 50%
     */
    function withdrawLiquidity(uint48 depNum, uint40 percent)
        external
        override
    {
        uint64 _time = uint64(block.timestamp);
        uint64 _withdrawTime = withdrawals[depNum] + withdrawTimeout;
        if (_time < _withdrawTime)
            revert WithdrawalTimeout(_withdrawTime - _time);
        if (msg.sender != ownerOf(depNum)) revert LiquidityNotOwned();

        withdrawals[depNum] = _time;
        uint128 topNodeAmount = treeNode[1].amount;
        uint128 withdrawValue = nodeWithdrawPercent(depNum, percent);

        if (withdrawValue == 0) revert NoLiquidity();

        // check withdrawValue allowed in ("node #1" - "active condition reinforcements")
        if (withdrawValue > (topNodeAmount - lockedLiquidity))
            revert LiquidityIsLocked();
        TransferHelper.safeTransfer(token, msg.sender, withdrawValue);

        emit LiquidityRemoved(msg.sender, withdrawValue);
    }

    /**
     * @notice Call Core to get AzuroBet token `tokenId` payout.
     * @param  tokenId AzuroBet token ID
     * @return if the payout is successfully resolved
     * @return the amount of winnings of the owner of the token
     */
    function viewPayout(uint256 tokenId)
        external
        view
        override
        returns (bool, uint128)
    {
        return (ICore(azuroBet.getCoreByToken(tokenId)).viewPayout(tokenId));
    }

    /**
     * @notice Withdraw payout based on bet with AzuroBet token `tokenId` in finished or cancelled condition.
     * @param  tokenId AzuroBet token ID withdraw payout to
     */
    function withdrawPayout(uint256 tokenId) external override {
        if (azuroBet.ownerOf(tokenId) != msg.sender) revert OnlyBetOwner();

        (bool success, uint128 amount) = ICore(azuroBet.getCoreByToken(tokenId))
            .resolvePayout(tokenId);

        if (!success) revert NoWinNoPrize();

        TransferHelper.safeTransfer(token, msg.sender, amount);
        emit BetterWin(msg.sender, tokenId, amount);
    }

    /**
     * @notice Reward contract owner (DAO) with total amount of charged fees.
     */
    function claimDaoReward() external override {
        if (totalDaoRewards == 0) revert NoDaoReward();

        uint128 rewards = totalDaoRewards;
        totalDaoRewards = 0;
        TransferHelper.safeTransfer(token, owner(), rewards);
    }

    /**
     * @notice Send oracle `oracle` `amount` of tokens.
     * @param  oracle address of oracle send to.
     * @param  amount amount of tokens send to.
     */
    function sendOracleReward(address oracle, uint128 amount)
        external
        override
        onlyCore
    {
        TransferHelper.safeTransfer(token, oracle, amount);
    }

    /**
     * @notice Make new bet in exchange of AzuroBet token.
     * @param  conditionId the match or game ID
     * @param  amount amount of tokens to bet
     * @param  outcomeId ID of predicted outcome
     * @param  deadline the time before which bet should be made
     * @param  minOdds minimum allowed bet odds
     * @return ID of bet's AzuroBet token.
     */
    function bet(
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external override ensure(deadline) returns (uint256) {
        if (amount == 0) revert AmountMustNotBeZero();

        azuroBet.mint(msg.sender, address(core));
        uint256 tokenId = azuroBet.totalSupply();

        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        (uint256 odds, uint128 fund1, uint128 fund2) = core.putBet(
            conditionId,
            tokenId,
            amount,
            outcomeId,
            minOdds
        );
        emit NewBet(
            msg.sender,
            tokenId,
            conditionId,
            outcomeId,
            amount,
            odds,
            fund1,
            fund2
        );
        return tokenId;
    }

    /**
     * @notice Core: Change amount of reserved by conditions funds.
     * @param  initReserve reinforcement of the condition.
     * @param  profitReserve amount of reserves that was not demand according to the condition results
     */
    function addReserve(
        uint128 initReserve,
        uint128 profitReserve,
        uint48 leaf
    ) external override onlyCore {
        if (profitReserve >= initReserve) {
            // pool win
            uint128 profit = profitReserve - initReserve;

            // calc oracle rewards
            uint128 oracleRewards = (profit * oracleFee) / multiplier;

            // calc DAO rewards
            uint128 daoRewards = (profit * daoFee) / multiplier;
            totalDaoRewards += daoRewards;

            // add profit to segmentTree
            addLimit(profit - (oracleRewards + daoRewards), leaf);
        } else {
            // remove loss from segmentTree excluding canceled conditions (when profitReserve = 0)
            if (profitReserve > 0) {
                removeLimit(initReserve - profitReserve, leaf);
            }
        }
        // send back locked reinforcement
        lockedLiquidity = lockedLiquidity - initReserve;
    }

    /**
     * @notice Core: Indicate `amount` of reserve as locked.
     * @param  amount reserves to lock
     */
    function lockReserve(uint128 amount) external override onlyCore {
        lockedLiquidity += amount;
        if (lockedLiquidity > treeNode[1].amount) revert NotEnoughReserves();
    }

    /**
     * @notice Get total reserved funds.
     */
    function getReserve() external view override returns (uint128 reserve) {
        return treeNode[1].amount;
    }

    /**
     * @notice Check if it is possible to use `reinforcementAmount` of tokens as condition reinforcement.
     * @param  reinforcementAmount amount of tokens intended to be used as condition reinforcement.
     * @return status if now it is possible
     */
    function getPossibilityOfReinforcement(uint128 reinforcementAmount)
        external
        view
        override
        returns (bool status)
    {
        return (lockedLiquidity + reinforcementAmount <=
            (reinforcementAbility * treeNode[1].amount) / multiplier);
    }

    /**
     * @notice Get current oracle fee where `multiplier` equals 100% of bettor winnings.
     */
    function getOracleFee() external view override returns (uint128 fee) {
        return oracleFee;
    }

    /**
     * @notice Get fee multiplier.
     */
    function getFeeMultiplier()
        external
        view
        override
        returns (uint128 feeMultiplier)
    {
        return multiplier;
    }

    /**
     * @dev get segment tree last added leaf
     */
    function getLeaf() external view override returns (uint48 leaf) {
        return (nextNode - 1);
    }
}
