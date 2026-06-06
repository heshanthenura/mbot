import { REST, Routes, SlashCommandBuilder } from "discord.js";

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

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Replies with pong"),
  new SlashCommandBuilder()
    .setName("bye")
    .setDescription("Leaves the voice channel"),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Stops the music and clears the queue"),
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("URL or Search Query")
        .setRequired(true)
        .setAutocomplete(true),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

async function deploy() {
  try {
    console.log("Deploying slash commands...");

    // TODO: prod ekedi change karapannnnnnnnnnn
    await rest.put(Routes.applicationCommands(clientId), {
      // await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Slash commands deployed");
  } catch (err) {
    console.error(err);
  }
}

deploy();
