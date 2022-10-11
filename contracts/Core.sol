// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "./Math.sol";
import "./interface/ILP.sol";
import "./interface/ICore.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title Azuro internal core register bets and create conditions
contract Core is OwnableUpgradeable, ICore, Math {
    uint256 public lastConditionId;

    uint128 public defaultReinforcement;
    uint128 public defaultMargin;

    uint128 private _deprecatedStorageVar;
    uint128 public multiplier;

    uint64 public maxBanksRatio;
    bool public allConditionsStopped;

    mapping(uint64 => uint128) reinforcements; // outcomeId -> reinforcement
    mapping(uint64 => uint128) margins; // outcomeId -> margin

    mapping(uint256 => Condition) public conditions;
    mapping(uint256 => Bet) public bets; // tokenId -> bet

    mapping(address => bool) public oracles;
    mapping(address => bool) public maintainers;

    // oracle-oracleCondId-conditionId
    mapping(address => mapping(uint256 => uint256)) public oracleConditionIds;

    ILP public LP;

    uint64 public override activeConditions;

    /**
     * @notice Only permits calls by oracles.
     */
    modifier onlyOracle() {
        if (oracles[msg.sender] == false) revert OnlyOracle();
        _;
    }

    /**
     * @notice Only permits calls by maintainers.
     */
    modifier onlyMaintainer() {
        if (maintainers[msg.sender] == false) revert OnlyMaintainer();
        _;
    }

    /**
     * @notice Only permits calls by LP.
     */
    modifier onlyLp() {
        if (msg.sender != address(LP)) revert OnlyLp();
        _;
    }

    function initialize(
        uint128 reinforcement,
        address oracle,
        uint128 margin
    ) external virtual initializer {
        __Ownable_init();
        oracles[oracle] = true;
        defaultReinforcement = reinforcement;
        defaultMargin = margin;
        maxBanksRatio = 10000;
        multiplier = 10**9;
    }

    /**
     * @notice Oracle: Register new condition.
     * @param  oracleCondId the match or game ID in oracle's internal system
     * @param  scopeId ID of the competition or event the condition belongs
     * @param  odds start odds for [team 1, team 2]
     * @param  outcomes unique outcomes for the condition [outcome 1, outcome 2]
     * @param  timestamp time when match starts and bets stopped accepts
     * @param  ipfsHash detailed info about match stored in IPFS
     */
    function createCondition(
        uint256 oracleCondId,
        uint128 scopeId,
        uint64[2] memory odds,
        uint64[2] memory outcomes,
        uint64 timestamp,
        bytes32 ipfsHash
    ) external override onlyOracle {
        if (timestamp <= block.timestamp) revert IncorrectTimestamp();
        if (odds[0] == 0 || odds[1] == 0) revert ZeroOdds();
        if (outcomes[0] == outcomes[1]) revert SameOutcomes();
        if (oracleConditionIds[msg.sender][oracleCondId] != 0)
            revert ConditionAlreadyCreated();
        if (!LP.getPossibilityOfReinforcement(getReinforcement(outcomes[0])))
            revert NotEnoughLiquidity();

        activeConditions++;
        lastConditionId++;
        oracleConditionIds[msg.sender][oracleCondId] = lastConditionId;

        Condition storage newCondition = conditions[lastConditionId];
        newCondition.scopeId = scopeId;
        newCondition.reinforcement = getReinforcement(outcomes[0]);

        newCondition.fundBank[0] =
            (newCondition.reinforcement * odds[1]) /
            (odds[0] + odds[1]);
        newCondition.fundBank[1] =
            (newCondition.reinforcement * odds[0]) /
            (odds[0] + odds[1]);

        newCondition.margin = getMargin(outcomes[0]);
        newCondition.outcomes = outcomes;
        newCondition.timestamp = timestamp;
        newCondition.ipfsHash = ipfsHash;
        newCondition.leaf = LP.getLeaf();

        LP.lockReserve(newCondition.reinforcement);

        emit ConditionCreated(oracleCondId, lastConditionId, timestamp);
    }

    /**
     * @notice LP: Register new bet in the core.
     * @param  conditionId the match or game ID
     * @param  tokenId AzuroBet token ID
     * @param  amount amount of tokens to bet
     * @param  outcome ID of predicted outcome
     * @param  minOdds minimum allowed bet odds
     * @return betting odds
     * @return fund bank of condition's outcome 1
     * @return fund bank of condition's outcome 2
     */
    function putBet(
        uint256 conditionId,
        uint256 tokenId,
        uint128 amount,
        uint64 outcome,
        uint64 minOdds
    )
        external
        override
        onlyLp
        returns (
            uint64,
            uint128,
            uint128
        )
    {
        Condition storage condition = conditions[conditionId];
        if (allConditionsStopped || condition.state != ConditionState.CREATED)
            revert BetNotAllowed();
        uint8 outcomeIndex = (
            outcome == conditions[conditionId].outcomes[0] ? 0 : 1
        );
        if (
            (condition.fundBank[outcomeIndex] + amount) /
                condition.fundBank[outcomeIndex == 1 ? 0 : 1] >=
            maxBanksRatio
        ) revert BigDifference();
        if (block.timestamp >= condition.timestamp) revert ConditionStarted();
        if (!isOutComeCorrect(conditionId, outcome)) revert WrongOutcome();

        uint64 odds = calculateOdds(conditionId, amount, outcome);

        if (odds < minOdds) revert SmallOdds();
        if (amount <= multiplier) revert SmallBet();

        Bet storage bet = bets[tokenId];
        bet.conditionId = conditionId;
        bet.amount = amount;
        bet.outcome = outcome;
        bet.createdAt = uint64(block.timestamp);
        bet.odds = odds;

        condition.fundBank[outcomeIndex] += amount;
        condition.payouts[outcomeIndex] += (odds * amount) / multiplier;
        condition.totalNetBets[outcomeIndex] += amount;

        return (odds, condition.fundBank[0], condition.fundBank[1]);
    }

    /**
     * @notice LP: Resolve AzuroBet token `tokenId` payout.
     * @param  tokenId AzuroBet token ID
     * @return success if the payout is successfully resolved
     * @return amount the amount of winnings of the owner of the token
     */
    function resolvePayout(uint256 tokenId)
        external
        override
        onlyLp
        returns (bool success, uint128 amount)
    {
        Bet storage currentBet = bets[tokenId];

        Condition storage condition = conditions[currentBet.conditionId];

        if (
            condition.state != ConditionState.RESOLVED &&
            condition.state != ConditionState.CANCELED
        ) revert ConditionNotStarted();

        (success, amount) = viewPayout(tokenId);

        if (success && amount > 0) currentBet.payed = true;
        return (success, amount);
    }

    /**
     * @notice Oracle: Indicate outcome `outcomeWin` as happened in oracle's condition `oracleCondId`.
     * @param  oracleCondId the match or game ID in oracle's internal system
     * @param  outcomeWin ID of happened outcome
     */
    function resolveCondition(uint256 oracleCondId, uint64 outcomeWin)
        external
        override
        onlyOracle
    {
        uint256 conditionId = oracleConditionIds[msg.sender][oracleCondId];

        Condition storage condition = conditions[conditionId];
        if (condition.timestamp == 0) revert ConditionNotExists();
        uint64 timeOut = condition.timestamp + 1 minutes;
        if (block.timestamp < timeOut) revert ResolveTooEarly(timeOut);
        if (condition.state != ConditionState.CREATED)
            revert ConditionAlreadyResolved();

        if (!isOutComeCorrect(conditionId, outcomeWin)) revert WrongOutcome();

        condition.outcomeWin = outcomeWin;
        condition.state = ConditionState.RESOLVED;
        activeConditions--;

        uint8 outcomeIndex = (outcomeWin == condition.outcomes[0] ? 0 : 1);
        uint128 bettersPayout = condition.payouts[outcomeIndex];

        uint128 profitReserve = (condition.fundBank[0] +
            condition.fundBank[1]) - bettersPayout;

        LP.addReserve(condition.reinforcement, profitReserve, condition.leaf);

        emit ConditionResolved(
            oracleCondId,
            conditionId,
            outcomeWin,
            uint8(ConditionState.RESOLVED),
            profitReserve
        );
    }

    /**
     * @notice Owner: Set `lp` as LP new address.
     * @param  lp new LP contract address
     */
    function setLp(address lp) external override onlyOwner {
        LP = ILP(lp);
        emit LpChanged(lp);
    }

    /**
     * @notice Owner: Indicate address `oracle` as oracle.
     * @param  oracle new oracle address
     */
    function setOracle(address oracle) external onlyOwner {
        oracles[oracle] = true;
        emit OracleAdded(oracle);
    }

    /**
     * @notice Owner: Do not consider address `oracle` a oracle anymore
     * @param  oracle address of oracle to renounce
     */
    function renounceOracle(address oracle) external onlyOwner {
        oracles[oracle] = false;
        emit OracleRenounced(oracle);
    }

    /**
     * @notice Owner: Indicate if address `maintainer` is active maintainer or not.
     * @param  maintainer maintainer address
     * @param  active if address is currently maintainer or not
     */
    function addMaintainer(address maintainer, bool active) external onlyOwner {
        maintainers[maintainer] = active;
        emit MaintainerUpdated(maintainer, active);
    }

    /**
     * @notice  Oracle: Indicate the condition `oracleConditionId` as canceled.
     * @param   oracleCondId the current match or game ID in oracle's internal system
     */
    function cancelByOracle(uint256 oracleCondId) external onlyOracle {
        cancel(oracleConditionIds[msg.sender][oracleCondId], oracleCondId);
    }

    /**
     * @notice  Maintainer: Indicate the condition `conditionId` as canceled.
     * @param   conditionId the current match or game ID
     */
    function cancelByMaintainer(uint256 conditionId) external onlyMaintainer {
        cancel(conditionId, 0);
    }

    /**
     * @notice  Indicate the condition `conditionId` with oracle ID `oracleConditionId` as canceled.
     * @dev     Set oracleCondId to zero if the function is not called by an oracle.
     * @param   conditionId the current match or game ID
     * @param   oracleCondId the current match or game ID in oracle's internal system
     */
    function cancel(uint256 conditionId, uint256 oracleCondId) internal {
        Condition storage condition = conditions[conditionId];
        if (condition.timestamp == 0) revert ConditionNotExists();
        if (
            condition.state == ConditionState.RESOLVED ||
            condition.state == ConditionState.CANCELED
        ) revert ConditionAlreadyResolved();

        condition.state = ConditionState.CANCELED;
        activeConditions--;

        LP.addReserve(
            condition.reinforcement,
            condition.reinforcement,
            condition.leaf
        );
        emit ConditionResolved(
            oracleCondId,
            conditionId,
            0,
            uint8(ConditionState.CANCELED),
            0
        );
    }

    /**
     * @notice Maintainer: Set `newTimestamp` as new condition `conditionId` deadline.
     * @param  oracleCondId the match or game ID
     * @param  newTimestamp new condition start time
     */
    function shift(uint256 oracleCondId, uint64 newTimestamp)
        external
        onlyOracle
    {
        uint256 conditionId = oracleConditionIds[msg.sender][oracleCondId];
        if (conditions[conditionId].timestamp == 0) revert ConditionNotExists();
        conditions[conditionId].timestamp = newTimestamp;
        emit ConditionShifted(oracleCondId, conditionId, newTimestamp);
    }

    function claimOracleReward() external onlyOracle {
        LP.claimOracleReward(msg.sender);
    }

    /**
     * @notice Maintainer: Change maximum ratio of condition's outcomes fund banks.
     * @param  newRatio new maximum ratio
     */
    function changeMaxBanksRatio(uint64 newRatio) external onlyMaintainer {
        maxBanksRatio = newRatio;
        emit MaxBanksRatioChanged(newRatio);
    }

    /**
     * @notice Get reinforcement for outcome `outcomeId`.
     * @param  outcomeId outcome ID
     * @return reinforcement for outcome `outcomeId` if defined or default value
     */
    function getReinforcement(uint64 outcomeId) public view returns (uint128) {
        if (reinforcements[outcomeId] != 0) return reinforcements[outcomeId];
        return defaultReinforcement;
    }

    /**
     * @notice Maintainer: Update reinforcement values for outcomes.
     * @param  data new reinforcement values in format:
     *              [outcomeId 1, reinforcement 1, ... 2, ... 2, ...]
     */
    function updateReinforcements(uint128[] memory data)
        external
        onlyMaintainer
    {
        if (data.length % 2 == 1) revert WrongDataFormat();

        for (uint256 i = 0; i < data.length; i += 2) {
            reinforcements[uint64(data[i])] = data[i + 1];
        }
    }

    /**
     * @notice Maintainer: Change default reinforcement.
     * @param  reinforcement new default reinforcement
     */
    function changeDefaultReinforcement(uint128 reinforcement)
        external
        onlyMaintainer
    {
        defaultReinforcement = reinforcement;
    }

    /**
     * @notice Get margin for outcome `outcomeId`.
     * @param  outcomeId outcome ID
     * @return margin for outcome `outcomeId` if defined or default value
     */
    function getMargin(uint64 outcomeId) public view returns (uint128) {
        if (margins[outcomeId] != 0) return margins[outcomeId];
        return defaultMargin;
    }

    /**
     * @notice Maintainer: Update margin values for outcomes.
     * @param  data new margin values in format:
     *              [outcomeId 1, margin 1, ... 2, ... 2, ...]
     */
    function updateMargins(uint128[] memory data) external onlyMaintainer {
        if (data.length % 2 == 1) revert WrongDataFormat();

        for (uint256 i = 0; i < data.length; i += 2) {
            margins[uint64(data[i])] = data[i + 1];
        }
    }

    /**
     * @notice Maintainer: Change default margin.
     * @param  margin new default margin
     */
    function changeDefaultMargin(uint128 margin) external onlyMaintainer {
        defaultMargin = margin;
    }

    /**
     * @notice Maintainer: Indicate the status of total bet lock.
     * @param  flag if stop receiving bets or not
     */
    function stopAllConditions(bool flag) external onlyMaintainer {
        if (allConditionsStopped == flag) revert FlagAlreadySet();
        allConditionsStopped = flag;
        emit AllConditionsStopped(flag);
    }

    /**
     * @notice Maintainer: Indicate the status of condition `conditionId` bet lock.
     * @param  conditionId the match or game ID
     * @param  flag if stop receiving bets for the condition or not
     */
    function stopCondition(uint256 conditionId, bool flag)
        external
        onlyMaintainer
    {
        Condition storage condition = conditions[conditionId];
        // only CREATED state can be stoped
        // only PAUSED state can be restored
        if (
            (condition.state != ConditionState.CREATED && flag) ||
            (condition.state != ConditionState.PAUSED && !flag)
        ) revert CantChangeFlag();

        condition.state = flag ? ConditionState.PAUSED : ConditionState.CREATED;

        emit ConditionStopped(conditionId, flag);
    }

    /**
     * @notice Get AzuroBet token `tokenId` payout.
     * @param  tokenId AzuroBet token ID
     * @return success if the payout is successfully resolved
     * @return amount winnings of the owner of the token
     */
    function viewPayout(uint256 tokenId)
        public
        view
        override
        returns (bool success, uint128 amount)
    {
        Bet storage currentBet = bets[tokenId];
        Condition storage condition = conditions[currentBet.conditionId];

        if (currentBet.payed) return (false, 0);
        if (condition.state == ConditionState.CANCELED)
            return (true, currentBet.amount);
        if (
            condition.state == ConditionState.RESOLVED &&
            condition.outcomeWin == currentBet.outcome
        ) return (true, (currentBet.odds * currentBet.amount) / multiplier);
        return (false, 0);
    }

    /**
     * @notice Get condition by it's ID.
     * @param  conditionId the match or game ID
     * @return the match or game struct
     */
    function getCondition(uint256 conditionId)
        external
        view
        returns (Condition memory)
    {
        return (conditions[conditionId]);
    }

    /**
     * @notice Get condition `conditionId` fund banks.
     * @param  conditionId the match or game ID
     * @return fundBank fund banks of condition
     */
    function getConditionFunds(uint256 conditionId)
        external
        view
        returns (uint128[2] memory fundBank)
    {
        return (conditions[conditionId].fundBank);
    }

    /**
     * @notice Get condition `conditionId` reinforcement.
     * @param  conditionId the match or game ID
     * @return reinforcement condition's reinforcement
     */
    function getConditionReinforcement(uint256 conditionId)
        external
        view
        returns (uint128 reinforcement)
    {
        return (conditions[conditionId].reinforcement);
    }

    /**
     * @notice Calculate the odds of bet with amount `amount` for outcome `outcome` of condition `conditionId`.
     * @param  conditionId the match or game ID
     * @param  amount amount of tokens to bet
     * @param  outcome ID of predicted outcome
     * @return odds betting odds
     */
    function calculateOdds(
        uint256 conditionId,
        uint128 amount,
        uint64 outcome
    ) public view returns (uint64 odds) {
        if (isOutComeCorrect(conditionId, outcome)) {
            Condition storage condition = conditions[conditionId];
            uint8 outcomeIndex = (outcome == condition.outcomes[0] ? 0 : 1);
            odds = uint64(
                Math.getOddsFromBanks(
                    condition.fundBank[0] +
                        condition.totalNetBets[1] -
                        condition.payouts[1],
                    condition.fundBank[1] +
                        condition.totalNetBets[0] -
                        condition.payouts[0],
                    amount,
                    outcomeIndex,
                    condition.margin,
                    multiplier
                )
            );
        }
    }

    /**
     * @notice Check if the condition `conditionId` have outcome `outcome` as possible
     * @param  conditionId the match or game ID
     * @param  outcome outcome ID
     */
    function isOutComeCorrect(uint256 conditionId, uint256 outcome)
        public
        view
        returns (bool correct)
    {
        correct = (outcome == conditions[conditionId].outcomes[0] ||
            outcome == conditions[conditionId].outcomes[1]);
    }

    /**
     * @notice  Get AzuroBet token info.
     * @param   betId AzuroBet token ID
     * @return  amount the bet amount
     * @return  odds betting odds
     * @return  createdAt when the bet was registered
     */
    function getBetInfo(uint256 betId)
        external
        view
        override
        returns (
            uint128 amount,
            uint64 odds,
            uint64 createdAt
        )
    {
        return (bets[betId].amount, bets[betId].odds, bets[betId].createdAt);
    }

    /**
     * @notice Check if the address `oracle` is oracle.
     * @return if the address `oracle` is oracle.
     */
    function isOracle(address oracle) external view override returns (bool) {
        return oracles[oracle];
    }
}
