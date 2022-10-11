const { getTestCoreOwner } = require("../utils/utils");

task("stop-conditions", "Indicate all conditions or just specified condition as locked")
  .addOptionalParam("id", "The match or game ID", 0, types.int)
  .setAction(async (args, hre) => {
    const [core, owner] = await getTestCoreOwner(hre);
    if (args.id == 0) {
      await core.connect(owner).stopAllConditions(true);
    } else {
      await core.connect(owner).stopCondition(args.id, true);
    }
  });
