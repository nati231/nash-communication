
import { Router } from "express";
import { searchUsers } from "../controllers/user.controller.js";

const router = Router();

router.get("/search", searchUsers);

export default router;