// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

interface ICore {
    enum ConditionState {
        CREATED,
        RESOLVED,
        CANCELED,
        PAUSED
    }

    struct Bet {
        uint256 conditionId;
        uint128 amount;
        uint64 outcome;
        uint64 createdAt;
        uint64 odds;
        bool payed;
    }

    struct Condition {
        uint128[2] fundBank;
        uint128[2] payouts;
        uint128[2] totalNetBets;
        uint128 reinforcement;
        uint128 margin;
        bytes32 ipfsHash;
        uint64[2] outcomes; // unique outcomes for the condition
        uint128 scopeId;
        uint64 outcomeWin;
        uint64 timestamp; // after this time user cant put bet on condition
        ConditionState state;
        uint48 leaf;
    }

    event ConditionCreated(
        uint256 indexed oracleConditionId,
        uint256 indexed conditionId,
        uint64 timestamp
    );
    event ConditionResolved(
        uint256 indexed oracleConditionId,
        uint256 indexed conditionId,
        uint64 outcomeWin,
        uint8 state,
        uint256 amountForLp
    );
    event LpChanged(address indexed newLp);
    event MaxBanksRatioChanged(uint64 newRatio);
    event MaintainerUpdated(address indexed maintainer, bool active);
    event OracleAdded(address indexed newOracle);
    event OracleRenounced(address indexed oracle);
    event AllConditionsStopped(bool flag);
    event ConditionStopped(uint256 indexed conditionId, bool flag);
    event ConditionShifted(
        uint256 oracleCondId,
        uint256 conditionId,
        uint64 newTimestamp
    );

    error OnlyLp();
    error OnlyMaintainer();
    error OnlyOracle();

    error FlagAlreadySet();
    error CantChangeFlag();
    error IncorrectTimestamp();
    error SameOutcomes();
    error SmallBet();
    error SmallOdds();
    error WrongDataFormat();
    error WrongOutcome();
    error ZeroOdds();

    error ConditionNotExists();
    error ConditionNotStarted();
    error ResolveTooEarly(uint64 waitTime);
    error ConditionStarted();
    error ConditionAlreadyCreated();
    error ConditionAlreadyResolved();
    error BetNotAllowed();

    error BigDifference();
    error CantAcceptBet();
    error NotEnoughLiquidity();

    function activeConditions() external view returns (uint64);

    function createCondition(
        uint256 oracleConditionId,
        uint128 scopeId,
        uint64[2] memory odds,
        uint64[2] memory outcomes,
        uint64 timestamp,
        bytes32 ipfsHash
    ) external;

    function resolveCondition(uint256 conditionId, uint64 outcomeWin) external;

    function viewPayout(uint256 tokenId) external view returns (bool, uint128);

    function resolvePayout(uint256 tokenId) external returns (bool, uint128);

    function setLp(address lp) external;

    function putBet(
        uint256 conditionId,
        uint256 tokenId,
        uint128 amount,
        uint64 outcome,
        uint64 minOdds
    )
        external
        returns (
            uint64,
            uint128,
            uint128
        );

    function getBetInfo(uint256 betId)
        external
        view
        returns (
            uint128 amount,
            uint64 odds,
            uint64 createdAt
        );

    function isOracle(address oracle) external view returns (bool);
}
