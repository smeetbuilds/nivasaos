import { randomBytes } from "node:crypto";

console.log(`NIVASA_INSTALL_TOKEN=${randomBytes(32).toString("base64url")}`);
