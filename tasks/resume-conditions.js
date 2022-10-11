const { getTestCoreOwner } = require("../utils/utils");

task("resume-conditions", "Indicate all conditions or just specified condition as resumed")
  .addOptionalParam("id", "The match or game ID", 0, types.int)
  .setAction(async (args, hre) => {
    const [core, owner] = await getTestCoreOwner(hre);

    if (args.id == 0) {
      await core.connect(owner).stopAllConditions(false);
    } else {
      await core.connect(owner).stopCondition(args.id, false);
    }
  });
