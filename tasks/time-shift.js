const { timeShiftBy, getBlockTime } = require("../utils/utils");

task("time-shift", "Shift network time to timestamp")
  .addOptionalParam(
    "timestamp",
    "Time when match starts and bets stopped accepts. If 0 set the parameter as current timestamp + one hour + one minute",
    0,
    types.int
  )
  .setAction(async (args, hre) => {
    await timeShiftBy(hre.ethers, args.timestamp != 0 ? args.timestamp : (await getBlockTime(hre.ethers)) + 3660);
  });
