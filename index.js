require('dotenv').config();

const fs = require('fs');

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const DB = './inscritos.json';

const load = () => {
  if (!fs.existsSync(DB)) return [];
  return JSON.parse(fs.readFileSync(DB, 'utf8'));
};

const save = (lista) => {
  fs.writeFileSync(DB, JSON.stringify(lista, null, 2));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = [
  new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envia um anúncio no canal e na DM de quem se inscreveu')
    .addStringOption((option) =>
      option
        .setName('texto')
        .setDescription('Mensagem do anúncio')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('painel-avisos')
    .setDescription('Posta o painel para os membros se inscreverem nos avisos por DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((command) => command.toJSON());

client.once('ready', async () => {
  await client.application.commands.set(
    commands,
    process.env.GUILD_ID
  );

  console.log(`✅ Online como ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // Botões
  if (interaction.isButton()) {
    let lista = load();

    if (interaction.customId === 'avisos_sub') {
      if (!lista.includes(interaction.user.id)) {
        lista.push(interaction.user.id);
        save(lista);
      }

      return interaction.reply({
        content: '✅ Inscrito! Você receberá os avisos por DM.',
        ephemeral: true,
      });
    }

    if (interaction.customId === 'avisos_unsub') {
      lista = lista.filter((id) => id !== interaction.user.id);
      save(lista);

      return interaction.reply({
        content: '🔕 Inscrição cancelada.',
        ephemeral: true,
      });
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // /painel-avisos
  if (interaction.commandName === 'painel-avisos') {
    const embed = new EmbedBuilder()
      .setTitle('📢 Avisos por DM')
      .setDescription(
        'Quer receber novidades e divulgação direto na sua DM? Clique em se inscrever. Você pode sair quando quiser.'
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('avisos_sub')
        .setLabel('Inscrever')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('avisos_unsub')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({
      embeds: [embed],
      components: [row],
    });

    return interaction.reply({
      content: '✅ Painel postado.',
      ephemeral: true,
    });
  }

  // /anunciar
  if (interaction.commandName === 'anunciar') {
    await interaction.deferReply({ ephemeral: true });

    const texto = interaction.options.getString('texto');

    try {
      const canal = await client.channels.fetch(
        process.env.CANAL_AVISOS_ID
      );

      await canal.send(texto);

      const lista = load();

      const LOTE = 30;
      const PAUSA = 60 * 60 * 1000;

      const lotes = Math.ceil(lista.length / LOTE);

      await interaction.editReply(
        `📢 Enviado no canal!\n\n` +
        `Iniciando DMs: ${lista.length} inscritos em ` +
        `${lotes} lote(s) de ${LOTE}, com pausa de 1 hora entre lotes.`
      );

      // Envio das DMs em segundo plano
      (async () => {
        let ok = 0;
        let falha = 0;
        let enviados = 0;

        for (const id of lista) {
          try {
            const user = await client.users.fetch(id);

            await user.send(
              `${texto}\n\n` +
              `-# Para parar de receber, use o botão no painel de avisos do servidor.`
            );

            ok++;
          } catch (error) {
            falha++;
          }

          enviados++;

          await sleep(2500);

          if (
            enviados % LOTE === 0 &&
            enviados < lista.length
          ) {
            console.log(
              `📦 Lote concluído (${enviados}/${lista.length}). Pausa de 1h...`
            );

            await sleep(PAUSA);
          }
        }

        try {
          await interaction.user.send(
            `📢 Anúncio finalizado!\n\n` +
            `✅ DMs entregues: ${ok}\n` +
            `❌ Falhas: ${falha}`
          );
        } catch (error) {
          console.log('Não foi possível enviar o relatório por DM.');
        }

        console.log(
          `🏁 Anúncio finalizado. Sucesso: ${ok} | Falhas: ${falha}`
        );
      })();

      return;
    } catch (error) {
      console.error(error);

      return interaction.editReply(
        '❌ Ocorreu um erro ao enviar o anúncio.'
      );
    }
  }
});

client.login(process.env.TOKEN);
