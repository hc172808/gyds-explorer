import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import featureGatesRouter from "./feature-gates";
import adminWalletsRouter from "./admin-wallets";
import rpcRouter from "./rpc";
import nodesRouter from "./nodes";
import coinSettingsRouter from "./coin-settings";
import systemSettingsRouter from "./system-settings";
import faucetRouter from "./faucet";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/feature-gates", featureGatesRouter);
router.use("/admin/wallets", adminWalletsRouter);
router.use("/rpc", rpcRouter);
router.use("/nodes", nodesRouter);
router.use("/coin-settings", coinSettingsRouter);
router.use("/system", systemSettingsRouter);
router.use(faucetRouter);

export default router;
