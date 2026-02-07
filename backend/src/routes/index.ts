import { Hono } from "hono";
import { auth } from "./auth.routes.js";
import { chat } from "./chat.routes.js";
import { convRouter } from "./conversation.routes.js";
import { docs } from "./document.routes.js";
import { images } from "./image.routes.js";
import { health } from "./health.routes.js";
import type { AppEnv } from "../app.js";

const routes = new Hono<AppEnv>();

routes.route("/auth", auth);
routes.route("/", chat);
routes.route("/", convRouter);
routes.route("/", docs);
routes.route("/", images);
routes.route("/", health);

export { routes };
