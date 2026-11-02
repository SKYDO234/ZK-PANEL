import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commandData } from "./commands.js";
const {
  DISCORD_BOT_TOKEN: token,
  DISCORD_APPLICATION_ID: appId,
  DISCORD_GUILD_ID: guild,
} = process.env;
if (!token || !appId)
  throw new Error(
    "Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID in your environment.",
  );
const rest = new REST({ version: "10" }).setToken(token);
const route = guild
  ? Routes.applicationGuildCommands(appId, guild)
  : Routes.applicationCommands(appId);
await rest.put(route, { body: [commandData.toJSON()] });
console.log(
  `Registered /zk ${guild ? "for guild " + guild : "globally"}. Global command propagation may take a little time.`,
);
