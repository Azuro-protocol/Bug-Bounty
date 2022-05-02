// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

interface ILP {
    event NewBet(
        address indexed owner,
        uint256 indexed betId,
        uint256 indexed conditionId,
        uint64 outcomeId,
        uint128 amount,
        uint256 odds,
        uint128 fund1,
        uint128 fund2
    );

    event BetterWin(address indexed better, uint256 tokenId, uint256 amount);
    event LiquidityAdded(address indexed account, uint256 amount, uint48 leaf);
    event LiquidityRemoved(address indexed account, uint256 amount);
    event LiquidityRequested(
        address indexed requestWallet,
        uint256 requestedValueLp
    );

    event OracleRewardChanged(uint128 newOracleFee);
    event DaoRewardChanged(uint128 newDaoFee);
    event AzuroBetChanged(address newAzuroBet);
    event PeriodChanged(uint64 newPeriod);
    event MinDepoChanged(uint128 newMinDepo);
    event WithdrawTimeoutChanged(uint64 newWithdrawTimeout);

    error OnlyBetOwner();
    error OnlyCore();

    error AmountMustNotBeZero();
    error AmountNotSufficient();
    error NoDaoReward();
    error NoWinNoPrize();
    error LiquidityNotOwned();
    error LiquidityIsLocked();
    error NoLiquidity();
    error PaymentLocked();
    error WrongToken();
    error ConditionStarted();
    error NotEnoughReserves();
    error WithdrawalTimeout(uint64 waitTime);

    function changeCore(address newCore) external;

    function addLiquidity(uint128 amount) external;

    function withdrawLiquidity(uint48 depNum, uint40 percent) external;

    function viewPayout(uint256 tokenId) external view returns (bool, uint128);

    function bet(
        uint256 conditionId,
        uint128 amount,
        uint64 outcomeId,
        uint64 deadline,
        uint64 minOdds
    ) external returns (uint256);

    function getReserve() external view returns (uint128);

    function lockReserve(uint128 amount) external;

    function addReserve(
        uint128 initReserve,
        uint128 profitReserve,
        uint48 leaf
    ) external;

    function withdrawPayout(uint256 tokenId) external;

    function sendOracleReward(address oracle, uint128 amount) external;

    function claimDaoReward() external;

    function getPossibilityOfReinforcement(uint128 reinforcementAmount)
        external
        view
        returns (bool);

    function getOracleFee() external view returns (uint128 fee);

    function getFeeMultiplier() external view returns (uint128 feeDecimals);

    function getLeaf() external view returns (uint48 leaf);
}
