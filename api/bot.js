import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const group1 = [
  "Бабляк",
  "Воробей",
  "Ворожбит",
  "Воронцова",
  "Голубенко",
  "Гончар",
  "Дацко",
  "Дубнюк",
  "Дячок",
  "Катеренчук",
  "Кияненко",
  "Кравченко",
  "Скороход",
  "Трегуб",
];

const group2 = [
  "Дворжак",
  "Карпіленко",
  "Носаченко",
  "Павловський",
  "Петрова",
  "Прилипко",
  "Руколянська",
  "Сидоренко",
  "Скорик",
  "Соколов",
  "Чахлеу",
  "Чернов",
  "Чумак",
  "Шаповал",
  "Шиба",
];

const allStudents = [...group1, ...group2];

function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function chunk(arr, size = 2) {
  const rows = [];
  for (let i = 0; i < arr.length; i += size) {
    rows.push(arr.slice(i, i + size));
  }
  return rows;
}

function buildMainKeyboard(messageId) {
  return {
    inline_keyboard: [
      [
        { text: "➕ Мій +", callback_data: `plus|${messageId}` },
        { text: "➖ Мій -", callback_data: `minus|${messageId}` },
        { text: "🔁 Swap", callback_data: `swapstart|${messageId}` },
      ],
    ],
  };
}

function buildSwapKeyboard(messageId, actorItemId, candidates) {
  const buttons = candidates.map((item) => ({
    text: `${item.surname}${item.status ? " " + item.status : ""}`,
    callback_data: `swapto|${messageId}|${actorItemId}|${item.id}`,
  }));

  const rows = chunk(buttons, 2);
  rows.push([{ text: "⬅️ Назад", callback_data: `swapcancel|${messageId}` }]);

  return { inline_keyboard: rows };
}

function parseGenerateCommand(text) {
  let students = null;
  let subject = "";
  let scope = "all";
  let title = "";

  if (text.startsWith("/generate_1")) {
    students = group1;
    subject = text.replace("/generate_1", "").trim();
    scope = "group1";
    title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 1):`;
  } else if (text.startsWith("/generate_2")) {
    students = group2;
    subject = text.replace("/generate_2", "").trim();
    scope = "group2";
    title = `Черга здачі${subject ? " з " + subject : ""} (Підгрупа 2):`;
  } else if (text.startsWith("/generate")) {
    students = allStudents;
    subject = text.replace("/generate", "").trim();
    scope = "all";
    title = `Черга здачі${subject ? " з " + subject : ""} (вся група):`;
  }

  return { students, subject, scope, title };
}

function renderQueueText(queue, items, history = []) {
  let text = `${queue.title}\n`;

  for (const item of items) {
    text += `${item.position}. ${item.surname}${item.status ? " " + item.status : ""}\n`;
  }

  if (history.length > 0) {
    text += "\n<blockquote expandable>\n";
    for (const row of history.slice(-20)) {
      text += `${escapeHtml(row.action)}\n`;
    }
    text += "</blockquote>";
  }

  return text;
}

async function tg(method, payload) {
  const resp = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = await resp.json();

  if (!data.ok) {
    if (
      data.description &&
      data.description.includes("message is not modified")
    ) {
      return null;
    }

    console.error("TELEGRAM_ERROR", { method, payload, response: data });
    throw new Error(`Telegram API error in ${method}: ${JSON.stringify(data)}`);
  }

  return data.result;
}

async function sendTempMessage(chatId, text) {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
  });
}

async function answerCallbackQuery(
  callbackQueryId,
  text = "",
  showAlert = false,
) {
  await tg("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function editMessageKeyboard(chatId, messageId, replyMarkup) {
  await tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

async function getBoundSurname(tgUserId) {
  const { data, error } = await supabase
    .from("user_bindings")
    .select("surname")
    .eq("tg_user_id", tgUserId)
    .maybeSingle();

  if (error) throw error;
  return data?.surname || null;
}

async function getQueueByMessage(chatId, messageId) {
  const { data, error } = await supabase
    .from("queues")
    .select("*")
    .eq("chat_id", chatId)
    .eq("message_id", messageId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getQueueItems(queueId) {
  const { data, error } = await supabase
    .from("queue_items")
    .select("*")
    .eq("queue_id", queueId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getQueueHistory(queueId) {
  const { data, error } = await supabase
    .from("queue_history")
    .select("*")
    .eq("queue_id", queueId)
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function appendHistory(
  queueId,
  actorTgId,
  actorName,
  actionType,
  actionText,
  payload = {},
) {
  const { error } = await supabase.from("queue_history").insert({
    queue_id: queueId,
    actor_tg_id: actorTgId ?? null,
    actor_name: actorName || "",
    action_type: actionType,
    action: actionText,
    payload_json: payload,
  });

  if (error) throw error;
}

async function rebuildMessage(chatId, messageId) {
  const queue = await getQueueByMessage(chatId, messageId);
  if (!queue) return;

  const items = await getQueueItems(queue.id);
  const history = await getQueueHistory(queue.id);
  const text = renderQueueText(queue, items, history);

  await tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: buildMainKeyboard(messageId),
  });
}

async function createQueue(chatId, title, scope, subject, surnames) {
  const { data: queueRow, error: queueError } = await supabase
    .from("queues")
    .insert({
      chat_id: chatId,
      message_id: 0,
      title,
      scope,
      subject,
    })
    .select("*")
    .single();

  if (queueError) throw queueError;

  const items = surnames.map((surname, index) => ({
    queue_id: queueRow.id,
    surname,
    position: index + 1,
    status: "",
  }));

  const { error: itemsError } = await supabase
    .from("queue_items")
    .insert(items);

  if (itemsError) throw itemsError;

  const text = renderQueueText(queueRow, items, []);
  const sent = await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: buildMainKeyboard(0),
  });

  const { error: updateError } = await supabase
    .from("queues")
    .update({
      message_id: sent.message_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", queueRow.id);

  if (updateError) throw updateError;

  await tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: sent.message_id,
    reply_markup: buildMainKeyboard(sent.message_id),
  });

  await appendHistory(queueRow.id, null, "system", "generate", "generate", {
    scope,
    subject,
  });

  return sent.message_id;
}

async function restoreQueueFromReply(
  chatId,
  replyMessageId,
  replyText,
  actorId,
  actorName,
) {
  const lines = replyText
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !x.startsWith("<blockquote"))
    .filter((x) => !x.startsWith("</blockquote>"));

  if (lines.length < 2) return false;

  const title = lines[0];
  const parsedItems = [];

  for (let i = 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(\d+)\.\s+(\S+)(?:\s+([+-]))?$/);
    if (!m) continue;
    parsedItems.push({
      position: Number(m[1]),
      surname: m[2],
      status: m[3] || "",
    });
  }

  if (parsedItems.length === 0) return false;

  let queue = await getQueueByMessage(chatId, replyMessageId);

  if (!queue) {
    const { data, error } = await supabase
      .from("queues")
      .insert({
        chat_id: chatId,
        message_id: replyMessageId,
        title,
        scope: title.includes("Підгрупа 1")
          ? "group1"
          : title.includes("Підгрупа 2")
            ? "group2"
            : "all",
        subject: "",
      })
      .select("*")
      .single();

    if (error) throw error;
    queue = data;
  } else {
    const { error } = await supabase
      .from("queues")
      .update({
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", queue.id);

    if (error) throw error;

    const { error: deleteItemsError } = await supabase
      .from("queue_items")
      .delete()
      .eq("queue_id", queue.id);

    if (deleteItemsError) throw deleteItemsError;
  }

  const { error: insertItemsError } = await supabase.from("queue_items").insert(
    parsedItems.map((item) => ({
      queue_id: queue.id,
      surname: item.surname,
      position: item.position,
      status: item.status,
    })),
  );

  if (insertItemsError) throw insertItemsError;

  await appendHistory(
    queue.id,
    actorId,
    actorName,
    "restore",
    `restore (${actorName})`,
    {},
  );

  await rebuildMessage(chatId, replyMessageId);
  return true;
}

async function setStatus(
  chatId,
  messageId,
  surname,
  status,
  actorId,
  actorName,
) {
  const queue = await getQueueByMessage(chatId, messageId);
  if (!queue) return false;

  const items = await getQueueItems(queue.id);
  const target = items.find((x) => x.surname === surname);
  if (!target) return false;

  const oldStatus = target.status || "";

  const { error } = await supabase
    .from("queue_items")
    .update({ status })
    .eq("id", target.id);

  if (error) throw error;

  await appendHistory(
    queue.id,
    actorId,
    actorName,
    "set_status",
    `${surname}: ${oldStatus || "∅"} → ${status || "∅"} (${actorName})`,
    { surname, oldStatus, newStatus: status },
  );

  await rebuildMessage(chatId, messageId);
  return true;
}

async function swapStudents(chatId, messageId, a, b, actorId, actorName) {
  const queue = await getQueueByMessage(chatId, messageId);
  if (!queue) return { ok: false, reason: "Чергу не знайдено" };

  const items = await getQueueItems(queue.id);
  const first = items.find((x) => x.surname === a);
  const second = items.find((x) => x.surname === b);

  if (!first || !second) {
    return { ok: false, reason: "Не знайдено одне або два прізвища" };
  }

  if (first.status !== "+" || second.status !== "+") {
    return { ok: false, reason: "Swap дозволений тільки якщо в обох стоїть +" };
  }

  const firstOldPos = first.position;
  const secondOldPos = second.position;

  const { error: e1 } = await supabase
    .from("queue_items")
    .update({ position: -101 })
    .eq("id", first.id);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("queue_items")
    .update({ position: -102 })
    .eq("id", second.id);
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("queue_items")
    .update({ position: secondOldPos })
    .eq("id", first.id);
  if (e3) throw e3;

  const { error: e4 } = await supabase
    .from("queue_items")
    .update({ position: firstOldPos })
    .eq("id", second.id);
  if (e4) throw e4;

  await appendHistory(
    queue.id,
    actorId,
    actorName,
    "swap",
    `swap ${a}(${firstOldPos}) ↔ ${b}(${secondOldPos}) (${actorName})`,
    { a, b },
  );

  await rebuildMessage(chatId, messageId);

  await sendTempMessage(
    chatId,
    `🔁 ${actorName} поміняв місцями ${a} (${firstOldPos}) ↔ ${b} (${secondOldPos})`,
  );

  return { ok: true };
}

async function swapStudentsByIds(
  chatId,
  messageId,
  firstItemId,
  secondItemId,
  actorId,
  actorName,
) {
  const queue = await getQueueByMessage(chatId, messageId);
  if (!queue) return { ok: false, reason: "Чергу не знайдено" };

  const items = await getQueueItems(queue.id);
  const first = items.find((x) => x.id === Number(firstItemId));
  const second = items.find((x) => x.id === Number(secondItemId));

  if (!first || !second) {
    return { ok: false, reason: "Не знайдено одне або два прізвища" };
  }

  if (first.status !== "+" || second.status !== "+") {
    return { ok: false, reason: "Swap дозволений тільки якщо в обох стоїть +" };
  }

  const firstOldPos = first.position;
  const secondOldPos = second.position;

  const { error: e1 } = await supabase
    .from("queue_items")
    .update({ position: -101 })
    .eq("id", first.id);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("queue_items")
    .update({ position: -102 })
    .eq("id", second.id);
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("queue_items")
    .update({ position: secondOldPos })
    .eq("id", first.id);
  if (e3) throw e3;

  const { error: e4 } = await supabase
    .from("queue_items")
    .update({ position: firstOldPos })
    .eq("id", second.id);
  if (e4) throw e4;

  await appendHistory(
    queue.id,
    actorId,
    actorName,
    "swap",
    `swap ${first.surname}(${firstOldPos}) ↔ ${second.surname}(${secondOldPos}) (${actorName})`,
    { a: first.surname, b: second.surname },
  );

  await rebuildMessage(chatId, messageId);

  await sendTempMessage(
    chatId,
    `🔁 ${actorName} поміняв місцями ${first.surname} (${firstOldPos}) ↔ ${second.surname} (${secondOldPos})`,
  );

  return { ok: true };
}

async function moveStudent(
  chatId,
  messageId,
  surname,
  newPos,
  actorId,
  actorName,
) {
  const queue = await getQueueByMessage(chatId, messageId);
  if (!queue) return false;

  const items = await getQueueItems(queue.id);
  const target = items.find((x) => x.surname === surname);
  if (!target) return false;

  const oldPos = target.position;
  const maxPos = items.length;
  const finalPos = Math.max(1, Math.min(Number(newPos), maxPos));

  if (oldPos === finalPos) return true;

  const reordered = items
    .filter((x) => x.id !== target.id)
    .sort((x, y) => x.position - y.position);

  reordered.splice(finalPos - 1, 0, target);

  for (let i = 0; i < reordered.length; i += 1) {
    const item = reordered[i];
    const { error } = await supabase
      .from("queue_items")
      .update({ position: 1000 + i })
      .eq("id", item.id);

    if (error) throw error;
  }

  for (let i = 0; i < reordered.length; i += 1) {
    const item = reordered[i];
    const { error } = await supabase
      .from("queue_items")
      .update({ position: i + 1 })
      .eq("id", item.id);

    if (error) throw error;
  }

  await appendHistory(
    queue.id,
    actorId,
    actorName,
    "move",
    `move ${surname}: ${oldPos} → ${finalPos} (${actorName})`,
    { surname, oldPos, newPos: finalPos },
  );

  await rebuildMessage(chatId, messageId);
  return true;
}

async function markUpdateProcessed(updateId) {
  const { error } = await supabase
    .from("processed_updates")
    .insert({ update_id: updateId });

  if (error) throw error;
}

async function isUpdateProcessed(updateId) {
  const { data, error } = await supabase
    .from("processed_updates")
    .select("update_id")
    .eq("update_id", updateId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("ok");
  }

  try {
    const body = req.body;
    const updateId = body?.update_id;

    if (typeof updateId === "number") {
      const alreadyProcessed = await isUpdateProcessed(updateId);
      if (alreadyProcessed) {
        return res.status(200).send("ok");
      }
      await markUpdateProcessed(updateId);
    }

    const cb = body?.callback_query;
    if (cb) {
      const callbackId = cb.id;
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      const actorId = cb.from?.id ?? null;
      const actorName = cb.from?.first_name || "user";
      const data = cb.data || "";

      if (!chatId || !messageId || !data) {
        await answerCallbackQuery(callbackId);
        return res.status(200).send("ok");
      }

      const parts = data.split("|");
      const action = parts[0];
      const targetMessageId = Number(parts[1]);

      if (targetMessageId !== Number(messageId)) {
        await answerCallbackQuery(callbackId, "Кнопка застаріла", true);
        return res.status(200).send("ok");
      }

      if (action === "plus" || action === "minus") {
        const boundSurname = await getBoundSurname(actorId);

        if (!boundSurname) {
          await answerCallbackQuery(
            callbackId,
            "Спочатку виконай /me Прізвище",
            true,
          );
          return res.status(200).send("ok");
        }

        const ok = await setStatus(
          chatId,
          messageId,
          boundSurname,
          action === "plus" ? "+" : "-",
          actorId,
          actorName,
        );

        if (!ok) {
          await answerCallbackQuery(
            callbackId,
            "Не вдалося змінити статус",
            true,
          );
        } else {
          await answerCallbackQuery(callbackId, "Готово");
        }

        return res.status(200).send("ok");
      }

      if (action === "swapstart") {
        const queue = await getQueueByMessage(chatId, messageId);
        if (!queue) {
          await answerCallbackQuery(callbackId, "Чергу не знайдено", true);
          return res.status(200).send("ok");
        }

        const boundSurname = await getBoundSurname(actorId);
        if (!boundSurname) {
          await answerCallbackQuery(
            callbackId,
            "Спочатку виконай /me Прізвище",
            true,
          );
          return res.status(200).send("ok");
        }

        const items = await getQueueItems(queue.id);
        const actorItem = items.find((x) => x.surname === boundSurname);

        if (!actorItem) {
          await answerCallbackQuery(
            callbackId,
            "Твого прізвища немає в цій черзі",
            true,
          );
          return res.status(200).send("ok");
        }

        if (actorItem.status !== "+") {
          await answerCallbackQuery(
            callbackId,
            "Для swap у тебе має стояти +",
            true,
          );
          return res.status(200).send("ok");
        }

        const candidates = items.filter(
          (x) => x.id !== actorItem.id && x.status === "+",
        );

        if (candidates.length === 0) {
          await answerCallbackQuery(
            callbackId,
            "Немає ні з ким мінятися",
            true,
          );
          return res.status(200).send("ok");
        }

        await editMessageKeyboard(
          chatId,
          messageId,
          buildSwapKeyboard(messageId, actorItem.id, candidates),
        );

        await answerCallbackQuery(callbackId, "Обери, з ким мінятися");
        return res.status(200).send("ok");
      }

      if (action === "swapto") {
        const actorItemId = Number(parts[2]);
        const targetItemId = Number(parts[3]);

        const result = await swapStudentsByIds(
          chatId,
          messageId,
          actorItemId,
          targetItemId,
          actorId,
          actorName,
        );

        if (!result.ok) {
          await answerCallbackQuery(callbackId, result.reason, true);
          await rebuildMessage(chatId, messageId);
        } else {
          await answerCallbackQuery(callbackId, "Swap виконано");
        }

        return res.status(200).send("ok");
      }

      if (action === "swapcancel") {
        await editMessageKeyboard(
          chatId,
          messageId,
          buildMainKeyboard(messageId),
        );
        await answerCallbackQuery(callbackId, "Скасовано");
        return res.status(200).send("ok");
      }

      await answerCallbackQuery(callbackId);
      return res.status(200).send("ok");
    }

    const msg = body?.message;
    if (!msg) {
      return res.status(200).send("ok");
    }

    const chatId = msg.chat?.id;
    const text = msg.text?.trim();
    const actorId = msg.from?.id ?? null;
    const actorName = msg.from?.first_name || "user";

    if (!chatId || !text) {
      return res.status(200).send("ok");
    }

    if (text === "/ping") {
      await sendTempMessage(chatId, "pong");
      return res.status(200).send("ok");
    }

    if (text.startsWith("/me")) {
      const surname = text.replace("/me", "").trim();
      if (surname) {
        const { error } = await supabase.from("user_bindings").upsert({
          tg_user_id: actorId,
          surname,
        });

        if (error) throw error;
        await sendTempMessage(chatId, `Тепер ти зареєстрований як ${surname}`);
      }
      return res.status(200).send("ok");
    }

    const generate = parseGenerateCommand(text);
    if (generate.students) {
      const shuffled = shuffle(generate.students);
      await createQueue(
        chatId,
        generate.title,
        generate.scope,
        generate.subject,
        shuffled,
      );
      return res.status(200).send("ok");
    }

    const replyMessageId = msg.reply_to_message?.message_id;
    const replyText = msg.reply_to_message?.text;

    if (text.startsWith("/restore")) {
      if (!replyMessageId || !replyText) {
        await sendTempMessage(chatId, "Reply на повідомлення з чергою");
        return res.status(200).send("ok");
      }

      const restored = await restoreQueueFromReply(
        chatId,
        replyMessageId,
        replyText,
        actorId,
        actorName,
      );

      if (!restored) {
        await sendTempMessage(chatId, "Не вдалося відновити чергу");
      }
      return res.status(200).send("ok");
    }

    if (text.startsWith("/sync")) {
      if (!replyMessageId) {
        await sendTempMessage(chatId, "Reply на повідомлення черги");
        return res.status(200).send("ok");
      }

      const queue = await getQueueByMessage(chatId, replyMessageId);
      if (!queue) {
        await sendTempMessage(chatId, "Чергу не знайдено в БД");
        return res.status(200).send("ok");
      }

      await rebuildMessage(chatId, replyMessageId);
      return res.status(200).send("ok");
    }

    if (!replyMessageId) {
      return res.status(200).send("ok");
    }

    let surnameForStatus = null;
    let statusAction = null;

    const pmFull = text.match(/^(\S+)\s*([+-])$/);
    if (pmFull) {
      surnameForStatus = pmFull[1];
      statusAction = pmFull[2];
    } else if (text === "+" || text === "-") {
      statusAction = text;

      const { data: binding, error: bindingError } = await supabase
        .from("user_bindings")
        .select("surname")
        .eq("tg_user_id", actorId)
        .maybeSingle();

      if (bindingError) throw bindingError;

      if (!binding?.surname) {
        await sendTempMessage(chatId, "Спочатку виконай /me Прізвище");
        return res.status(200).send("ok");
      }

      surnameForStatus = binding.surname;
    }

    if (surnameForStatus && statusAction) {
      const ok = await setStatus(
        chatId,
        replyMessageId,
        surnameForStatus,
        statusAction,
        actorId,
        actorName,
      );

      if (!ok) {
        await sendTempMessage(chatId, "Не вдалося змінити статус");
      }

      return res.status(200).send("ok");
    }

    if (text.startsWith("/swap")) {
      const args = text.replace("/swap", "").trim().split(/\s+/);
      if (args.length === 2) {
        const result = await swapStudents(
          chatId,
          replyMessageId,
          args[0],
          args[1],
          actorId,
          actorName,
        );

        if (!result.ok) {
          await sendTempMessage(chatId, result.reason);
        }
      } else {
        await sendTempMessage(chatId, "Формат: /swap Прізвище1 Прізвище2");
      }
      return res.status(200).send("ok");
    }

    if (text.startsWith("/move")) {
      const args = text.replace("/move", "").trim().split(/\s+/);
      if (args.length === 2) {
        const ok = await moveStudent(
          chatId,
          replyMessageId,
          args[0],
          Number(args[1]),
          actorId,
          actorName,
        );
        if (!ok) {
          await sendTempMessage(chatId, "Move не виконано");
        }
      } else {
        await sendTempMessage(chatId, "Формат: /move Прізвище Позиція");
      }
      return res.status(200).send("ok");
    }

    return res.status(200).send("ok");
  } catch (error) {
    console.error("BOT ERROR:", error);
    return res.status(200).send("ok");
  }
}
