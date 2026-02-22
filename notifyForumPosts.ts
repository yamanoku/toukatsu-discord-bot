// Denoのnpmパッケージ連携機能を使用
import {
  type APIChannel,
  APIEmbed,
  ChannelType,
  type RESTGetAPIGuildThreadsResult,
  Routes,
} from "discord.js";
import { initRestClient, sendDiscordNotification } from "./notifyDiscord.ts";

// --- 設定値 (環境変数からの取得を推奨) ---
const GUILD_ID = Deno.env.get("GUILD_ID") || "YOUR_GUILD_ID"; // 自分のサーバーID
const FORUM_CHANNEL_ID = Deno.env.get("FORUM_CHANNEL_ID") ||
  "YOUR_FORUM_CHANNEL_ID"; // 対象フォーラムチャンネルID
const MESSAGE_TARGET_CHANNEL_ID = Deno.env.get("MESSAGE_TARGET_CHANNEL_ID") ||
  "YOUR_TARGET_CHANNEL_ID"; // 通知先のチャンネルID

// Discordのチャンネルリンクの基盤
const BASE_LINK = `https://discord.com/channels/${GUILD_ID}`;
// ------------------------------------------

/**
 * フォーラムの投稿を取得、整形し、指定チャンネルに通知します。
 */
export async function notifyActiveForumPosts() {
  if (
    [GUILD_ID, FORUM_CHANNEL_ID, MESSAGE_TARGET_CHANNEL_ID].includes(
      "YOUR_BOT_TOKEN",
    )
  ) {
    console.error("エラー: 環境変数または定数をすべて設定してください。");
    return;
  }

  // 0. 自分のサーバーに接続する (RESTクライアントの初期化)
  const rest = initRestClient();

  try {
    // 1. 特定フォーラムのオープンな投稿の一覧を取得する
    // REST APIエンドポイント: GET /guilds/{guild_id}/threads/active
    const activeThreadsResult = await rest.get(
      Routes.guildActiveThreads(GUILD_ID),
    ) as RESTGetAPIGuildThreadsResult;

    // 結果からスレッドリストを取得
    const allThreads: APIChannel[] = activeThreadsResult.threads || [];

    // 特定のフォーラムチャンネルID（parent_id）と公開スレッド（type 11）でフィルタリング
    const activeForumPosts = allThreads.filter(
      (thread) =>
        thread.type === ChannelType.PublicThread &&
        thread.parent_id === FORUM_CHANNEL_ID,
    );

    if (activeForumPosts.length === 0) {
      console.log("通知対象となるアクティブな投稿はありませんでした。");
      return;
    }

    console.log(`アクティブな投稿数: ${activeForumPosts.length}件`);

    // 2. 整形する (Discord Embedを作成)
    const fields = activeForumPosts.map((post) => {
      // フォーラム投稿への直接リンクを生成
      const postLink = `${BASE_LINK}/${post.id}/${post.id}`;

      return {
        name: `📌 ${post.name}`,
        value: `[**スレッドを見る**](${postLink})`,
        inline: false,
      };
    }).slice(0, 10); // 最大10件に制限 (Embedの仕様上)

    const notificationEmbed: APIEmbed = {
      title: `📢 参加者募集中の一覧 (${activeForumPosts.length}件)`,
      description: `現在アクティブな募集の最新${fields.length}件です。`,
      color: 0x5865F2, // Discordカラー (Blurple)
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: `フォーラムチャンネルID: ${FORUM_CHANNEL_ID}`,
      },
    };

    // 3. 特定のチャンネルに投稿する
    // REST APIエンドポイント: POST /channels/{channel_id}/messages
    await sendDiscordNotification(
      rest,
      MESSAGE_TARGET_CHANNEL_ID,
      notificationEmbed,
    );
  } catch (error) {
    console.error("❌ 処理中にエラーが発生しました:", error);
  }
}
