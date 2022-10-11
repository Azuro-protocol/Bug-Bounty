// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interface/ILP.sol";
import "./interface/ICore.sol";
import "./interface/IWNative.sol";
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
    uint128 public totalDaoRewards; // deprecated DAO profit counter

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

    // DAO profit and loss counter
    int128 public realDaoRewards;

    // ORACLE profit and loss counter
    int128 public realOracleRewards;

    // Reward claim Timeout
    uint64 public claimTimeout;

    // last claim
    uint64 public lastClaimDao;
    uint64 public lastClaimOracle;

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

    receive() external payable {
        assert(msg.sender == token); // only accept native tokens via fallback from the WETH contract
    }

    /**
     * @notice Owner: Set `newCore` as Core address.
     * @param  newCore new Core contract address
     */
    function changeCore(address newCore) external override onlyOwner {
        if (address(core) != address(0) && core.activeConditions() != 0)
            revert ActiveConditions();

        core = ICore(newCore);
        emit coreChanged(newCore);
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

    function changeReinforcementAbility(uint128 newReinforcementAbility)
        external
        onlyOwner
    {
        reinforcementAbility = newReinforcementAbility;
        emit ReinforcementAbilityChanged(newReinforcementAbility);
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

    /**
     * @notice Owner: Set `claimTimeout` as newClaimTimeout value.
     * @param  newClaimTimeout new claimTimeout value
     */
    function changeClaimTimeout(uint64 newClaimTimeout) external onlyOwner {
        claimTimeout = newClaimTimeout;
        emit ClaimTimeoutChanged(newClaimTimeout);
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
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        _addLiquidity(amount);
    }

    /**
     * @notice Add some liquidity in pool sending native tokens with msg.value in exchange for LPNFT tokens
     */
    function addLiquidityNative() external payable override {
        IWNative(token).deposit{value: msg.value}();
        _addLiquidity(uint128(msg.value));
    }

    /**
     * @notice Add some liquidity in pool in exchange for LPNFT tokens
     * @param  amount token's amount to swap
     */
    function _addLiquidity(uint128 amount) internal {
        if (amount < minDepo) revert AmountNotSufficient();

        uint48 leaf = nodeAddLiquidity(amount);

        // make NFT
        _mint(msg.sender, leaf);
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
        uint128 withdrawValue = _withdrawLiquidity(depNum, percent);
        TransferHelper.safeTransfer(token, msg.sender, withdrawValue);
    }

    /**
     * @notice Withdraw liquidity for some NFT deposite #.
     * @param depNum - NFT with deposite number
     * @param percent - percent of leaf amount 1*10^12 is 100%, 5*10^11 is 50%
     */
    function withdrawLiquidityNative(uint48 depNum, uint40 percent)
        external
        override
    {
        uint128 withdrawValue = _withdrawLiquidity(depNum, percent);
        IWNative(token).withdraw(withdrawValue);
        TransferHelper.safeTransferETH(msg.sender, withdrawValue);
    }

    /**
     * @notice Withdraw liquidity for some NFT deposite #.
     * @param depNum - NFT with deposite number
     * @param percent - percent of leaf amount 1*10^12 is 100%, 5*10^11 is 50%
     */
    function _withdrawLiquidity(uint48 depNum, uint40 percent)
        internal
        returns (uint128 withdrawValue)
    {
        uint64 _time = uint64(block.timestamp);
        uint64 _withdrawTime = withdrawals[depNum] + withdrawTimeout;
        if (_time < _withdrawTime)
            revert WithdrawalTimeout(_withdrawTime - _time);
        if (msg.sender != ownerOf(depNum)) revert LiquidityNotOwned();

        withdrawals[depNum] = _time;
        uint128 topNodeAmount = treeNode[1].amount;

        // reduce liquidity tree by percent
        withdrawValue = nodeWithdrawPercent(depNum, percent);

        if (withdrawValue == 0) revert NoLiquidity();

        // check withdrawValue allowed in ("node #1" - "active condition reinforcements")
        if (withdrawValue > (topNodeAmount - lockedLiquidity))
            revert LiquidityIsLocked();
        emit LiquidityRemoved(msg.sender, depNum, withdrawValue);
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
        uint128 amount = _withdrawPayout(tokenId);
        TransferHelper.safeTransfer(token, msg.sender, amount);
    }

    /**
     * @notice Withdraw payout based on bet with AzuroBet token `tokenId` in finished or cancelled condition.
     * @param  tokenId AzuroBet token ID withdraw payout to
     */
    function withdrawPayoutNative(uint256 tokenId) external override {
        uint128 amount = _withdrawPayout(tokenId);
        IWNative(token).withdraw(amount);
        TransferHelper.safeTransferETH(msg.sender, amount);
    }

    /**
     * @notice Withdraw payout based on bet with AzuroBet token `tokenId` in finished or cancelled condition.
     * @param  tokenId AzuroBet token ID withdraw payout to
     */
    function _withdrawPayout(uint256 tokenId) internal returns (uint128) {
        if (azuroBet.ownerOf(tokenId) != msg.sender) revert OnlyBetOwner();

        (bool success, uint128 amount) = ICore(azuroBet.getCoreByToken(tokenId))
            .resolvePayout(tokenId);

        if (!success) revert NoWinNoPrize();

        emit BetterWin(msg.sender, tokenId, amount);

        return amount;
    }

    /**
     * @notice Reward contract owner (DAO) with total amount of charged fees.
     */
    function claimDaoReward() external {
        // if totalDaoRewards - move it to realDaoRewards
        if (totalDaoRewards > 0) {
            realDaoRewards += int128(totalDaoRewards);
            totalDaoRewards = 0;
        }

        if (realDaoRewards <= 0) revert NoDaoReward();
        if ((block.timestamp - lastClaimDao) < claimTimeout)
            revert ClaimTimeout(lastClaimDao + claimTimeout);

        TransferHelper.safeTransfer(token, owner(), uint128(realDaoRewards));
        realDaoRewards = 0;
        lastClaimDao = uint64(block.timestamp);
    }

    /**
     * @notice Reward contract Oracle with total amount of charged fees.
     */
    function claimOracleReward(address oracle) external override onlyCore {
        if (realOracleRewards <= 0) revert NoOracleReward();

        if ((block.timestamp - lastClaimOracle) < claimTimeout)
            revert ClaimTimeout(lastClaimOracle + claimTimeout);

        TransferHelper.safeTransfer(token, oracle, uint128(realOracleRewards));
        realOracleRewards = 0;
        lastClaimOracle = uint64(block.timestamp);
    }

    /**
     * @notice Make new bet in exchange of AzuroBet token for bettor
     * @param  bettor wallet to bet for
     * @param  conditionId the match or game ID
     * @param  amount amount of tokens to bet
     * @param  outcomeId ID of predicted outcome
     * @param  deadline the time before which bet should be made
     * @param  minOdds minimum allowed bet odds
     * @return tokenId ID of bet's AzuroBet token.
     */

    function betFor(
        address bettor,
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external override returns (uint256) {
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        return _bet(bettor, conditionId, amount, outcomeId, deadline, minOdds);
    }

    /**
     * @notice Make new bet in exchange of AzuroBet token.
     * @param  conditionId the match or game ID
     * @param  amount amount of tokens to bet
     * @param  outcomeId ID of predicted outcome
     * @param  deadline the time before which bet should be made
     * @param  minOdds minimum allowed bet odds
     * @return tokenId ID of bet's AzuroBet token.
     */
    function bet(
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external override returns (uint256) {
        TransferHelper.safeTransferFrom(
            token,
            msg.sender,
            address(this),
            amount
        );
        return
            _bet(msg.sender, conditionId, amount, outcomeId, deadline, minOdds);
    }

    /**
     * @notice Make new bet in exchange of AzuroBet token.
     * @param  conditionId the match or game ID
     * @param  outcomeId ID of predicted outcome
     * @param  deadline the time before which bet should be made
     * @param  minOdds minimum allowed bet odds
     * @return tokenId ID of bet's AzuroBet token.
     */
    function betNative(
        uint256 conditionId,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external payable override returns (uint256) {
        IWNative(token).deposit{value: msg.value}();
        return
            _bet(
                msg.sender,
                conditionId,
                uint128(msg.value),
                outcomeId,
                deadline,
                minOdds
            );
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
    function _bet(
        address bettor,
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) internal ensure(deadline) returns (uint256) {
        if (amount == 0) revert AmountMustNotBeZero();

        azuroBet.mint(bettor, address(core));
        uint256 tokenId = azuroBet.totalSupply();

        (uint256 odds, uint128 fund1, uint128 fund2) = core.putBet(
            conditionId,
            tokenId,
            amount,
            outcomeId,
            minOdds
        );
        emit NewBet(
            bettor,
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
     * @param  finalReserve amount of reserves that was not demand according to the condition results, when condition is canceling passed value is 0
     */
    function addReserve(
        uint128 initReserve,
        uint128 finalReserve,
        uint48 leaf
    ) external override onlyCore {
        if (finalReserve > initReserve) {
            // pool win
            uint128 profit = finalReserve - initReserve;

            // calc oracle rewards
            uint128 oracleRewards = (profit * oracleFee) / multiplier;
            // calc DAO rewards
            uint128 daoRewards = (profit * daoFee) / multiplier;

            // add profit to liquidity (reduced by oracle/dao's rewards)
            addLimit(
                profit -
                    (_addDelta(realOracleRewards, oracleRewards) +
                        _addDelta(realDaoRewards, daoRewards)),
                leaf
            );
            realOracleRewards += int128(oracleRewards);
            realDaoRewards += int128(daoRewards);
        } else {
            // remove all loss from segmentTree and separately reduce DAO, Oracle excluding canceled conditions (when finalReserve = initReserve)
            if (initReserve - finalReserve > 0) {
                uint128 loss = initReserve - finalReserve;

                // reduce oracle loss
                uint128 oracleLoss = (loss * oracleFee) / multiplier;
                // reduce DAO rewards
                uint128 daoLoss = (loss * daoFee) / multiplier;

                // remove all loss (reduced by oracle/dao's losses) from liquidity
                remove(
                    loss -
                        (_reduceDelta(realOracleRewards, oracleLoss) +
                            _reduceDelta(realDaoRewards, daoLoss))
                );
                realOracleRewards -= int128(oracleLoss);
                realDaoRewards -= int128(daoLoss);
            }
        }
        // send back locked reinforcement
        lockedLiquidity = lockedLiquidity - initReserve;
    }

    /**
     * @notice internal calculate liquidity changing delta in case win
     * @notice returned delta when real reward is positive or become positive after change
     * @param  real amount of real reward
     * @param  change change amount of changing
     * @return delta for liquidity correction
     */
    function _addDelta(int128 real, uint128 change)
        internal
        pure
        returns (uint128)
    {
        // + win
        if (real < 0) {
            int128 realChanged = real + int128(change);
            return (realChanged > 0) ? uint128(realChanged) : 0;
        } else return change;
    }

    /**
     * @notice internal calculate liquidity changing delta in case loss
     * @notice returned delta when real reward is positive or become positive after change
     * @param  real amount of real reward
     * @param  change change amount of changing
     * @return delta for liquidity correction
     */
    function _reduceDelta(int128 real, uint128 change)
        internal
        pure
        returns (uint128)
    {
        // loss
        return (
            real < 0 ? 0 : (real > int128(change) ? change : uint128(real))
        );
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
     * @dev get segment tree last added leaf
     */
    function getLeaf() external view override returns (uint48 leaf) {
        return (nextNode - 1);
    }
}
