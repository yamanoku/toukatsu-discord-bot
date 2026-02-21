import { APIEmbed, REST, Routes } from "discord.js";

// 🚨 トークンはBotの「パスワード」です。厳重に管理してください。
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") || "YOUR_BOT_TOKEN";

export function initRestClient(): REST {
  // 0. 自分のサーバーに接続する (RESTクライアントの初期化)
  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  console.log("RESTクライアントを初期化しました。API操作を開始します...");
  return rest;
}

/**
 * Discordの指定チャンネルにEmbedメッセージを送信する関数。
 * @param rest - discord.jsのRESTクライアントインスタンス。
 * @param channelId - メッセージを送信するチャンネルのID。
 * @param embed - 送信するAPIEmbedオブジェクト。
 */
export async function sendDiscordNotification(
  rest: REST,
  channelId: string,
  embed: APIEmbed,
): Promise<void> {
  try {
    await rest.post(
      Routes.channelMessages(channelId),
      {
        body: {
          embeds: [embed],
        },
      },
    );
    console.log(`✅ 通知をチャンネルID ${channelId} へ送信しました。`);
  } catch (error) {
    console.error(
      `❌ チャンネルID ${channelId} へのメッセージ送信中にエラーが発生しました:`,
      error,
    );
    throw error; // 呼び出し元にエラーを再スロー
  }
}
