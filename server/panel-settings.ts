import { config } from "./config.js";
import { setting } from "./db.js";

export function panelSettings() {
  const registration = setting("panel:registration");
  const maxServers = Number(setting("panel:max-servers"));
  return {
    registration: registration === undefined ? config.registration : registration === "true",
    maxServers: Number.isInteger(maxServers) && maxServers >= 1 && maxServers <= 1000 ? maxServers : config.maxServers,
  };
}
