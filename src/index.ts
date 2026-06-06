import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
import { createKazagumo } from "./lavalink/manager";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const kazagumo = createKazagumo(client);
const autocompleteCache = new Map<
  string,
  Array<{ name: string; value: string }>
>();

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

kazagumo.on("playerEmpty", (player) => {
  if (!player.textId) return;

  const channel = client.channels.cache.get(player.textId);

  if (!channel?.isSendable()) return;

  channel.send("Queue ended. Leaving voice channel.");

  setTimeout(() => {
    const current = kazagumo.players.get(player.guildId);

    if (!current || current.queue.size === 0) {
      player.destroy();
    }
  }, 10_000);
});

client.on("interactionCreate", async (interaction) => {
  const autocompleteTimeouts = new Map();

  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "play") return;

    const focused = interaction.options.getFocused();

    if (typeof focused !== "string" || focused.length === 0) {
      return interaction.respond([]);
    }

    const cachedChoices = autocompleteCache.get(focused);
    if (cachedChoices) {
      return interaction.respond(cachedChoices);
    }

    if (autocompleteTimeouts.has(interaction.user.id)) {
      clearTimeout(autocompleteTimeouts.get(interaction.user.id));
    }

    const timeout = setTimeout(async () => {
      try {
        const result = await kazagumo.search(focused, {
          requester: interaction.user,
        });

        const choices = result.tracks.slice(0, 25).map((t) => ({
          name: `${t.title} — ${t.author}`.slice(0, 100),
          value: (t.uri ?? t.title).slice(0, 100),
        }));

        autocompleteCache.set(focused, choices);

        if (!interaction.responded) {
          await interaction.respond(choices);
        }
      } catch (error) {
        console.error("Autocomplete search failed:", error);
        if (!interaction.responded) {
          await interaction.respond([]).catch(() => null);
        }
      } finally {
        autocompleteTimeouts.delete(interaction.user.id);
      }
    }, 400);

    autocompleteTimeouts.set(interaction.user.id, timeout);
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("query", true);

    const member = interaction.member;

    if (!member || !("voice" in member) || !member.voice.channel) {
      return interaction.reply({
        content: "You must join a voice channel first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const voiceChannel = member.voice.channel;

    await interaction.reply(`Searching for: ${query}`);

    const player = await kazagumo.createPlayer({
      guildId: interaction.guildId!,
      voiceId: voiceChannel.id,
      textId: interaction.channelId,
      volume: 100,
    });

    const result = await kazagumo.search(query, {
      requester: interaction.user,
    });

    if (!result.tracks.length) {
      return interaction.editReply("No results found");
    }

    const track = result.tracks[0];

    player.queue.add(track);

    if (!player.playing && !player.paused) {
      player.play();
    }

    await interaction.editReply(`Now playing: ${track.title}`);
  }
});

client.login(process.env.BOT_TOKEN);
