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
const AUTOCOMPLETE_TIMEOUT_MS = 1200;

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

kazagumo.on("playerEmpty", async (player) => {
  if (!player.textId) return;

  const channel = client.channels.cache.get(player.textId);

  const lastTrack = player.data.get("lastTrack");
  const requester = player.data.get("lastRequester") ?? null;

  try {
    const lastIdentifier = lastTrack?.identifier;

    if (!lastIdentifier) {
      throw new Error("No last track identifier available for autoplay");
    }

    const mixUrl = `https://www.youtube.com/watch?v=${lastIdentifier}&list=RD${lastIdentifier}`;

    const result = await kazagumo.search(mixUrl, {
      requester,
    });

    if (!result?.tracks.length) return;

    const nextTrack =
      result.tracks.find(
        (track) => track.identifier !== lastTrack.identifier,
      ) || result.tracks[0];

    if (nextTrack) {
      player.data.set("lastTrack", nextTrack);
      player.queue.add(nextTrack);
      if (!player.playing && !player.paused) {
        await player.play();
      }
      return;
    }
  } catch (error) {
    console.error("Autoplay failed:", error);
  }

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

    try {
      const result = await Promise.race([
        kazagumo.search(focused, {
          requester: interaction.user,
        }),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), AUTOCOMPLETE_TIMEOUT_MS);
        }),
      ]);

      if (!result) {
        return interaction.respond([]);
      }

      const choices = result.tracks.slice(0, 25).map((t) => ({
        name: `${t.title} — ${t.author}`.slice(0, 100),
        value: (t.uri ?? t.title).slice(0, 100),
      }));

      autocompleteCache.set(focused, choices);

      if (autocompleteCache.size > 50) {
        const firstKey = autocompleteCache.keys().next().value;
        if (firstKey) {
          autocompleteCache.delete(firstKey);
        }
      }

      return interaction.respond(choices);
    } catch (error) {
      console.error("Autocomplete search failed:", error);
      return interaction.respond([]).catch(() => null);
    }
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
    player.data.set("lastTrack", track);
    player.data.set("lastRequester", interaction.user);

    player.queue.add(track);

    if (!player.playing && !player.paused) {
      player.play();
    }

    await interaction.editReply(`Now playing: ${track.title}`);
  }

  if (interaction.commandName === "clear") {
    const player = kazagumo.players.get(interaction.guildId!);

    if (!player) {
      return interaction.reply({
        content: "No music is currently playing.",
        flags: MessageFlags.Ephemeral,
      });
    }

    player.queue.clear();

    await interaction.reply("Playback stopped and queue cleared.");
  }

  if (interaction.commandName === "bye") {
    const player = kazagumo.players.get(interaction.guildId!);

    if (!player) {
      return interaction.reply({
        content: "No music is currently playing.",
        flags: MessageFlags.Ephemeral,
      });
    }

    player.destroy();

    await interaction.reply("Goodbye!");
  }
});

client.login(process.env.BOT_TOKEN);
