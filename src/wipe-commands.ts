import { REST, Routes } from "discord.js";

const token = process.env.BOT_TOKEN || "";
if (token == "") {
  throw new Error("Environment variable BOT_TOKEN is not set");
}

const clientId = process.env.CLIENT_ID || "";
if (clientId == "") {
  throw new Error("Environment variable CLIENT_ID is not set");
}

const guildId = process.env.GUILD_ID || "";
if (guildId == "") {
  throw new Error("Environment variable GUILD_ID is not set");
}

const rest = new REST({ version: "10" }).setToken(token);

async function wipe() {
  try {
    console.log("Deleting global commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: [] });

    console.log("Deleting guild commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [],
    });

    console.log("All commands removed");
  } catch (err) {
    console.error(err);
  }
}

wipe();
