// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

/// @title Azuro betting odds calculation logic
contract Math {
    /**
     * @dev    See {_getOddsFromBanks}.
     * @param  outcomeIndex bet related condition's outcome number [0, 1]
     */
    function getOddsFromBanks(
        uint256 fund1Bank,
        uint256 fund2Bank,
        uint256 amount,
        uint256 outcomeIndex,
        uint256 margin,
        uint256 multiplier
    ) public pure returns (uint256) {
        if (outcomeIndex == 0) {
            return
                _getOddsFromBanks(
                    fund1Bank,
                    fund2Bank,
                    amount,
                    margin,
                    multiplier
                );
        }
        if (outcomeIndex == 1) {
            return
                _getOddsFromBanks(
                    fund2Bank,
                    fund1Bank,
                    amount,
                    margin,
                    multiplier
                );
        }
        return 0;
    }

    /**
     * @notice Get betting odds.
     * @param  fund1Bank fund bank of condition's outcome 1
     * @param  fund2Bank fund bank of condition's outcome 2
     * @param  amount amount of tokens to bet
     * @param  margin bookmaker commission
     * @param  multiplier decimal unit representation
     * @return betting odds value
     */
    function _getOddsFromBanks(
        uint256 fund1Bank,
        uint256 fund2Bank,
        uint256 amount,
        uint256 margin,
        uint256 multiplier
    ) internal pure returns (uint256) {
        return
            marginAdjustedOdds(
                (multiplier * (fund1Bank + fund2Bank + amount)) /
                    (fund1Bank + amount),
                margin,
                multiplier
            );
    }

    /**
     * @notice Get ceil of `x` with decimal unit representation `m`.
     */
    function ceil(uint256 a, uint256 m) public pure returns (uint256) {
        if (a < m) return m;
        return ((a + m - 1) / m) * m;
    }

    /**
     * @notice Get integer square root of `x`.
     */
    function sqrt(uint256 x) public pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * @notice Get commission adjusted betting odds.
     * @param  odds betting odds
     * @param  marginality bookmaker commission
     * @param  multiplier decimal unit representation
     * @return newOdds commission adjusted betting odds
     */
    function marginAdjustedOdds(
        uint256 odds,
        uint256 marginality,
        uint256 multiplier
    ) public pure returns (uint256 newOdds) {
        uint256 revertOdds = multiplier**2 /
            (multiplier - multiplier**2 / odds);
        uint256 a = ((multiplier + marginality) * (revertOdds - multiplier)) /
            (odds - multiplier);
        uint256 b = ((((revertOdds - multiplier) * multiplier) /
            (odds - multiplier)) *
            marginality +
            multiplier *
            marginality) / multiplier;
        newOdds =
            ((sqrt(b**2 + 4 * a * (multiplier - marginality)) - b) *
                multiplier) /
            (2 * a) +
            multiplier;
        return newOdds;
    }
}
