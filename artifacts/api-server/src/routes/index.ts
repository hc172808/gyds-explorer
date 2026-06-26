import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import featureGatesRouter from "./feature-gates";
import adminWalletsRouter from "./admin-wallets";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/feature-gates", featureGatesRouter);
router.use("/admin/wallets", adminWalletsRouter);

export default router;
